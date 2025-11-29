# Flow Marketing - Frontend

Interface do Flow Builder para criação de fluxos de conversa WhatsApp.

## 🚀 Tecnologias

- **React** + **TypeScript** + **Vite**
- **TailwindCSS** - Estilização moderna com glassmorphism
- **React Flow** - Canvas para visualização de flows
- **Zustand** - Gerenciamento de estado
- **React DnD** - Drag and Drop
- **Lucide React** - Ícones

## 📦 Instalação

```bash
npm install
```

## 🏃 Executar

```bash
npm run dev
```

O servidor iniciará em `http://localhost:5173`

## 🏗️ Estrutura

```
src/
├── components/
│   ├── FlowBuilder.tsx    # Componente principal
│   ├── Header.tsx          # Cabeçalho com nome e botão salvar
│   ├── Sidebar.tsx         # Lista de nós arrastáveis
│   └── nodes/
│       └── CustomNode.tsx  # Componente customizado de nó
├── store/
│   └── useFlowStore.ts    # Store Zustand
├── types/
│   └── flow-nodes.ts      # Tipos TypeScript
└── main.tsx               # Entry point
```

## 🎨 Funcionalidades

### Layout Principal

- **Sidebar (Esquerda)**: Lista de nós disponíveis para arrastar
- **Header (Topo)**: Nome do fluxo e botão "Salvar"
- **Canvas (Centro)**: Área onde o React Flow renderiza o fluxo

### Custom Nodes

Cada tipo de nó possui:
- **Cabeçalho colorido** identificando o tipo
- **Ícone** correspondente
- **Campos de configuração** específicos para cada tipo

### Tipos de Nós

1. **START** (Verde) - Gatilho do flow
2. **MESSAGE** (Azul) - Mensagem de texto
3. **MEDIA** (Roxo) - Mídia (imagem/vídeo)
4. **ACTION** (Amarelo) - Aguardar resposta
5. **HTTP** (Laranja) - Webhook externo
6. **AI** (Rosa) - Geração com IA
7. **CONDITION** (Índigo) - Decisão condicional
8. **END** (Vermelho) - Finalização

### Drag & Drop

- Arraste nós da sidebar para o canvas
- Conecte nós arrastando das handles (pontos de conexão)
- Nós de condição têm duas saídas (true/false)

### Salvar Flow

O botão "Salvar" exporta o JSON com:
- `nodes`: Array de nós com configurações
- `edges`: Array de conexões entre nós

O JSON é compatível com o formato esperado pelo backend.

## 🎯 Próximos Passos

- [ ] Integração com API do backend
- [ ] Carregar flow existente
- [ ] Validação de campos
- [ ] Preview do flow
- [ ] Temas (dark/light)
- [ ] Undo/Redo
- [ ] Zoom e pan otimizados






