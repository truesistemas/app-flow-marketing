-- Script para criar o banco de dados flow_marketing
-- Execute este script como superusuário do PostgreSQL

-- Criar banco de dados se não existir
CREATE DATABASE flow_marketing
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Portuguese_Brazil.1252'
    LC_CTYPE = 'Portuguese_Brazil.1252'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Comentário no banco
COMMENT ON DATABASE flow_marketing IS 'Banco de dados do Flow Marketing - SaaS de automação de mensagens WhatsApp';






