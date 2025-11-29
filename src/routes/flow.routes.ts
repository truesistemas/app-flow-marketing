import { FastifyInstance, FastifyRequest } from 'fastify';
import { PrismaClient, FlowStatus } from '@prisma/client';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { FlowTestService } from '../services/flow-test.service';

export async function flowRoutes(fastify: FastifyInstance) {
  const prisma = new PrismaClient();
  const flowTestService = new FlowTestService(prisma);

  // Todas as rotas requerem autenticação
  fastify.addHook('preHandler', authMiddleware as any);

  /**
   * GET /api/flows
   * Listar flows da organização
   */
  fastify.get('/', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const flows = await prisma.flow.findMany({
        where: {
          organizationId: authRequest.user.organizationId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          triggerKeyword: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              executions: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return reply.send({ flows });
    } catch (error) {
      return reply.code(500).send({ error: 'Erro ao listar flows' });
    }
  });

  /**
   * GET /api/flows/:id
   * Obter flow por ID
   */
  fastify.get('/:id', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };

      const flow = await prisma.flow.findFirst({
        where: {
          id,
          organizationId: authRequest.user.organizationId,
        },
      });

      if (!flow) {
        return reply.code(404).send({ error: 'Flow não encontrado' });
      }

      return reply.send({ flow });
    } catch (error) {
      return reply.code(500).send({ error: 'Erro ao obter flow' });
    }
  });

  /**
   * POST /api/flows
   * Criar novo flow
   */
  fastify.post(
    '/',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          nodes: any;
          edges: any;
          triggerKeyword?: string;
        };
      }>,
      reply
    ) => {
      try {
        const authRequest = request as AuthenticatedRequest;
        if (!authRequest.user) {
          return reply.code(401).send({ error: 'Não autenticado' });
        }

        const { name, description, nodes, edges, triggerKeyword } = request.body;

        if (!name || !nodes || !edges) {
          return reply.code(400).send({
            error: 'Nome, nodes e edges são obrigatórios',
          });
        }

        const flow = await prisma.flow.create({
          data: {
            name,
            description,
            nodes,
            edges,
            triggerKeyword,
            isActive: true, // Flow criado é automaticamente ativo
            organizationId: authRequest.user.organizationId,
          },
        });

        console.log(`[Flow Routes] ✅ Flow criado: ${flow.id} - ${flow.name} (isActive: ${flow.isActive})`);

        return reply.code(201).send({ flow });
      } catch (error) {
        return reply.code(500).send({ error: 'Erro ao criar flow' });
      }
    }
  );

  /**
   * PUT /api/flows/:id
   * Atualizar flow
   */
  fastify.put(
    '/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          description?: string;
          nodes?: any;
          edges?: any;
          triggerKeyword?: string;
          isActive?: boolean;
        };
      }>,
      reply
    ) => {
      try {
        const authRequest = request as AuthenticatedRequest;
        if (!authRequest.user) {
          return reply.code(401).send({ error: 'Não autenticado' });
        }

        const { id } = request.params;
        const updateData = request.body;

        // Verificar se flow existe e pertence à organização
        const existingFlow = await prisma.flow.findFirst({
          where: {
            id,
            organizationId: authRequest.user.organizationId,
          },
        });

        if (!existingFlow) {
          return reply.code(404).send({ error: 'Flow não encontrado' });
        }

        // Se isActive não foi enviado, manter o valor atual (ou true se não existir)
        if (updateData.isActive === undefined) {
          updateData.isActive = existingFlow.isActive !== undefined ? existingFlow.isActive : true;
        }

        const flow = await prisma.flow.update({
          where: { id },
          data: updateData,
        });

        console.log(`[Flow Routes] ✅ Flow atualizado: ${flow.id} - ${flow.name} (isActive: ${flow.isActive})`);

        return reply.send({ flow });
      } catch (error) {
        return reply.code(500).send({ error: 'Erro ao atualizar flow' });
      }
    }
  );

  /**
   * DELETE /api/flows/:id
   * Deletar flow
   * Query params:
   *   - deleteExecutions: boolean - Se true, deleta execuções ativas antes de deletar o flow
   */
  fastify.delete('/:id', async (request: FastifyRequest, reply) => {
    try {
      const authRequest = request as AuthenticatedRequest;
      if (!authRequest.user) {
        return reply.code(401).send({ error: 'Não autenticado' });
      }

      const { id } = request.params as { id: string };
      const query = request.query as { deleteExecutions?: string };
      const deleteExecutions = query.deleteExecutions === 'true';

      // Verificar se flow existe e pertence à organização
      const existingFlow = await prisma.flow.findFirst({
        where: {
          id,
          organizationId: authRequest.user.organizationId,
        },
      });

      if (!existingFlow) {
        return reply.code(404).send({ error: 'Flow não encontrado' });
      }

      // Verificar se há campanhas usando este flow
      const campaignsUsingFlow = await prisma.campaign.findMany({
        where: {
          flowId: id,
          organizationId: authRequest.user.organizationId,
        },
        select: {
          id: true,
          name: true,
          status: true,
        },
      });

      if (campaignsUsingFlow.length > 0) {
        const activeCampaigns = campaignsUsingFlow.filter(c => c.status === 'RUNNING');
        if (activeCampaigns.length > 0) {
          return reply.code(400).send({
            error: 'Não é possível deletar este flow',
            reason: 'active_campaigns',
            message: `Este flow está sendo usado por ${activeCampaigns.length} campanha(s) ativa(s). Desative ou remova o flow das campanhas antes de deletar.`,
            campaigns: activeCampaigns.map(c => ({ id: c.id, name: c.name })),
          });
        }
        
        // Se há campanhas inativas, avisar mas permitir deletar
        return reply.code(400).send({
          error: 'Não é possível deletar este flow',
          reason: 'campaigns_using',
          message: `Este flow está sendo usado por ${campaignsUsingFlow.length} campanha(s). Remova o flow das campanhas antes de deletar.`,
          campaigns: campaignsUsingFlow.map(c => ({ id: c.id, name: c.name })),
        });
      }

      // Verificar se há execuções ativas
      const activeExecutions = await prisma.flowExecution.findMany({
        where: {
          flowId: id,
          status: {
            in: ['PROCESSING', 'WAITING'],
          },
        },
        select: {
          id: true,
        },
      });

      if (activeExecutions.length > 0) {
        // Se o usuário optou por deletar execuções ativas, deletá-las primeiro
        if (deleteExecutions) {
          console.log(`[Flow Routes] Deletando ${activeExecutions.length} execução(ões) ativa(s) antes de deletar o flow`);
          
          // Atualizar status das execuções ativas para ABANDONED antes de deletar
          await prisma.flowExecution.updateMany({
            where: {
              flowId: id,
              status: {
                in: ['PROCESSING', 'WAITING'],
              },
            },
            data: {
              status: 'ABANDONED',
              completedAt: new Date(),
            },
          });
          
          console.log(`[Flow Routes] Execuções ativas canceladas. Prosseguindo com deleção do flow.`);
        } else {
          // Se não optou por deletar, retornar erro informando quantas execuções existem
          return reply.code(400).send({
            error: 'Não é possível deletar este flow',
            reason: 'active_executions',
            message: `Este flow possui ${activeExecutions.length} execução(ões) ativa(s).`,
            activeExecutionsCount: activeExecutions.length,
            canDeleteExecutions: true, // Indica que é possível deletar as execuções
          });
        }
      }

      // Deletar flow (execuções completadas serão deletadas em cascata se configurado no schema)
      await prisma.flow.delete({
        where: { id },
      });

      return reply.send({ message: 'Flow deletado com sucesso' });
    } catch (error: any) {
      console.error('Erro ao deletar flow:', error);
      
      // Verificar se é erro de constraint do Prisma (foreign key constraint)
      if (error.code === 'P2003' || error.code === 'P2014') {
        // P2003 = Foreign key constraint failed
        // P2014 = Required relation violation
        return reply.code(400).send({
          error: 'Não é possível deletar este flow',
          reason: 'constraint_violation',
          message: 'O flow está sendo usado por campanhas ou execuções. Remova as dependências antes de deletar.',
        });
      }
      
      return reply.code(500).send({ error: 'Erro ao deletar flow' });
    }
  });

  /**
   * POST /api/flows/:id/test
   * Testar execução de um flow
   * Se contactPhone e instanceId forem fornecidos, executa o flow real através da Evolution API
   */
  fastify.post(
    '/:id/test',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          contactPhone?: string;
          startNodeId?: string;
          instanceId?: string;
        };
      }>,
      reply
    ) => {
      try {
        const authRequest = request as AuthenticatedRequest;
        if (!authRequest.user) {
          return reply.code(401).send({ error: 'Não autenticado' });
        }

        const { id } = request.params;
        const { contactPhone, startNodeId, instanceId } = request.body || {};

        // Se telefone e instância foram fornecidos, executar flow real
        if (contactPhone && instanceId) {
          // Importar serviços necessários
          const { FlowEngineService } = await import('../services/flow-engine.service');
          const { MessageQueueService } = await import('../services/message-queue.service');
          const { AIService } = await import('../services/ai.service');
          const { HttpService } = await import('../services/http.service');

          const messageQueue = new MessageQueueService();
          const aiService = new AIService();
          const httpService = new HttpService();
          const flowEngine = new FlowEngineService(prisma, messageQueue, aiService, httpService);

          // Buscar instância
          const instance = await prisma.evolutionInstance.findFirst({
            where: {
              id: instanceId,
              organizationId: authRequest.user.organizationId,
              status: 'ACTIVE',
            },
          });

          if (!instance) {
            return reply.code(400).send({
              error: 'Instância não encontrada ou inativa',
            });
          }

          // Buscar ou criar contato
          let contact = await prisma.contact.findFirst({
            where: {
              phone: contactPhone,
              organizationId: authRequest.user.organizationId,
            },
          });

          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                phone: contactPhone,
                name: `Teste - ${contactPhone}`,
                organizationId: authRequest.user.organizationId,
              },
            });
          }

          // Iniciar flow real
          try {
            console.log(`[Flow Test] Iniciando flow real para teste:`);
            console.log(`[Flow Test]   - Flow ID: ${id}`);
            console.log(`[Flow Test]   - Contato: ${contact.phone} (${contact.id})`);
            console.log(`[Flow Test]   - Instância: ${instance.name} (${instance.id})`);

            // Usar startFlowForTest para isolar completamente o teste das campanhas
            // Este método sempre cria uma nova execução, abandonando execuções existentes
            await flowEngine.startFlowForTest(
              contact.id,
              id,
              authRequest.user.organizationId
            );

            console.log(`[Flow Test] ✅ Flow iniciado com sucesso`);

            return reply.send({
              success: true,
              message: 'Flow iniciado com sucesso! Acompanhe a execução em tempo real nos blocos do flow.',
              logs: [
                {
                  nodeId: 'flow',
                  nodeType: 'FLOW',
                  result: 'success',
                  message: `Flow iniciado para ${contactPhone} através da instância ${instance.name}. A execução aparecerá nos blocos em tempo real.`,
                  timestamp: new Date(),
                },
              ],
            });
          } catch (error: any) {
            console.error('Erro ao iniciar flow real:', error);
            return reply.code(500).send({
              error: error.message || 'Erro ao iniciar flow',
              logs: [
                {
                  nodeId: 'flow',
                  nodeType: 'FLOW',
                  result: 'error',
                  error: error.message || 'Erro ao iniciar flow',
                  timestamp: new Date(),
                },
              ],
            });
          }
        }

        // Caso contrário, executar teste simulado
        const result = await flowTestService.testFlow(id, authRequest.user.organizationId, {
          contactPhone,
          startNodeId,
        });

        return reply.send(result);
      } catch (error: any) {
        console.error('Erro ao testar flow:', error);
        return reply.code(500).send({
          error: error.message || 'Erro ao testar flow',
        });
      }
    }
  );

  /**
   * GET /api/flows/:id/executions
   * Buscar execuções ativas de um flow
   */
  fastify.get(
    '/:id/executions',
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply
    ) => {
      try {
        const authRequest = request as AuthenticatedRequest;
        if (!authRequest.user) {
          return reply.code(401).send({ error: 'Não autenticado' });
        }

        const { id } = request.params;

        // Buscar execuções ativas (PROCESSING ou WAITING) deste flow
        const executions = await prisma.flowExecution.findMany({
          where: {
            flowId: id,
            flow: {
              organizationId: authRequest.user.organizationId,
            },
            status: {
              in: ['PROCESSING', 'WAITING'],
            },
          },
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 50, // Limitar a 50 execuções mais recentes
        });

        // Formatar execuções com logs
        const formattedExecutions = executions.map((execution) => {
          const contextData = execution.contextData as any;
          return {
            id: execution.id,
            contactId: execution.contactId,
            contact: execution.contact,
            currentNodeId: execution.currentNodeId,
            status: execution.status,
            executedNodes: contextData?.executedNodes || [],
            userResponses: contextData?.userResponses || [],
            variables: contextData?.variables || {},
            startedAt: execution.startedAt,
            updatedAt: execution.updatedAt,
            completedAt: execution.completedAt,
          };
        });

        return reply.send({ executions: formattedExecutions });
      } catch (error: any) {
        console.error('Erro ao buscar execuções:', error);
        return reply.code(500).send({
          error: error.message || 'Erro ao buscar execuções',
        });
      }
    }
  );

  /**
   * POST /api/flows/:id/execute-from-node
   * Executar flow a partir de um nó específico (para testes)
   */
  fastify.post(
    '/:id/execute-from-node',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          nodeId: string;
          contactPhone?: string;
        };
      }>,
      reply
    ) => {
      try {
        const authRequest = request as AuthenticatedRequest;
        if (!authRequest.user) {
          return reply.code(401).send({ error: 'Não autenticado' });
        }

        const { id } = request.params;
        const { nodeId, contactPhone } = request.body || {};

        // Buscar flow
        const flow = await prisma.flow.findFirst({
          where: {
            id,
            organizationId: authRequest.user.organizationId,
          },
        });

        if (!flow) {
          return reply.code(404).send({ error: 'Flow não encontrado' });
        }

        // Buscar ou criar contato de teste
        let contact = await prisma.contact.findFirst({
          where: {
            phone: contactPhone || '5511999999999',
            organizationId: authRequest.user.organizationId,
          },
        });

        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              phone: contactPhone || '5511999999999',
              name: 'Teste',
              organizationId: authRequest.user.organizationId,
            },
          });
        }

        // Verificar se o nó existe no flow
        const nodes = flow.nodes as any[];
        const targetNode = nodes.find((n) => n.id === nodeId);

        if (!targetNode) {
          return reply.code(404).send({ error: 'Nó não encontrado no flow' });
        }

        // Importar FlowEngineService e processar a partir do nó
        const { FlowEngineService } = await import('../services/flow-engine.service');
        const { MessageQueueService } = await import('../services/message-queue.service');
        const { AIService } = await import('../services/ai.service');
        const { HttpService } = await import('../services/http.service');

        const messageQueue = new MessageQueueService();
        const aiService = new AIService();
        const httpService = new HttpService();
        const flowEngine = new FlowEngineService(prisma, messageQueue, aiService, httpService);

        // Executar a partir do nó
        const executionId = await flowEngine.executeFromNode(
          flow.id,
          nodeId,
          contact.id,
          authRequest.user.organizationId
        );

        return reply.send({
          success: true,
          executionId,
          message: 'Execução iniciada a partir do nó especificado',
        });
      } catch (error: any) {
        console.error('Erro ao executar flow a partir do nó:', error);
        return reply.code(500).send({
          error: error.message || 'Erro ao executar flow',
        });
      }
    }
  );

  /**
   * POST /api/flows/:flowId/executions/:executionId/reset
   * Resetar execução manualmente
   */
  fastify.post(
    '/:flowId/executions/:executionId/reset',
    async (
      request: FastifyRequest<{
        Params: { flowId: string; executionId: string };
      }>,
      reply
    ) => {
      try {
        const authRequest = request as AuthenticatedRequest;
        if (!authRequest.user) {
          return reply.code(401).send({ error: 'Não autenticado' });
        }

        const { flowId, executionId } = request.params;

        // Verificar se flow existe e pertence à organização
        const flow = await prisma.flow.findFirst({
          where: {
            id: flowId,
            organizationId: authRequest.user.organizationId,
          },
        });

        if (!flow) {
          return reply.code(404).send({ error: 'Flow não encontrado' });
        }

        // Verificar se execução existe e pertence ao flow
        const execution = await prisma.flowExecution.findFirst({
          where: {
            id: executionId,
            flowId: flowId,
          },
          include: {
            contact: true,
            flow: true,
          },
        });

        if (!execution) {
          return reply.code(404).send({ error: 'Execução não encontrada' });
        }

        // Verificar se contato pertence à organização
        if (execution.contact.organizationId !== authRequest.user.organizationId) {
          return reply.code(403).send({ error: 'Acesso negado' });
        }

        // Permitir resetar qualquer execução (incluindo PROCESSING e WAITING)
        // Isso permite reiniciar flows mesmo quando estão em execução
        const wasActive = execution.status === FlowStatus.PROCESSING || execution.status === FlowStatus.WAITING;
        
        if (wasActive) {
          console.log(`[Flow Routes] ⚠️ Resetando execução ATIVA (${execution.status}). Isso interromperá o flow em andamento.`);
        }

        // Buscar nó START do flow
        const flowStructure = flow.nodes as any[];
        const startNode = flowStructure.find((node: any) => node.type === 'START');

        if (!startNode) {
          return reply.code(400).send({ error: 'Flow não possui nó START' });
        }

        // Resetar execução
        const resetExecution = await prisma.flowExecution.update({
          where: { id: executionId },
          data: {
            status: FlowStatus.PROCESSING,
            currentNodeId: startNode.id,
            contextData: {
              variables: {},
              userResponses: [],
              executedNodes: [],
              resetAt: new Date(),
              previousStatus: execution.status,
            },
            completedAt: null,
          },
        });

        console.log(`[Flow Routes] ✅ Execução ${executionId} resetada manualmente`);

        // Importar FlowEngineService e reiniciar processamento
        const { FlowEngineService } = await import('../services/flow-engine.service');
        const { MessageQueueService } = await import('../services/message-queue.service');
        const { AIService } = await import('../services/ai.service');
        const { HttpService } = await import('../services/http.service');

        const messageQueue = new MessageQueueService();
        const aiService = new AIService();
        const httpService = new HttpService();
        const flowEngine = new FlowEngineService(prisma, messageQueue, aiService, httpService);

        // Usar método público resetExecution que já reinicia o processamento
        await flowEngine.resetExecution(executionId);

        return reply.send({
          success: true,
          execution: resetExecution,
          message: 'Execução resetada e reiniciada com sucesso',
        });
      } catch (error: any) {
        console.error('Erro ao resetar execução:', error);
        return reply.code(500).send({
          error: error.message || 'Erro ao resetar execução',
        });
      }
    }
  );
}

