# GF-MEI

Gestão Financeira para Microempreendedores Individuais. Protótipo local em TypeScript, React, Express e SQLite. Os valores monetários são armazenados em centavos inteiros. O relatório mensal usa a data de recebimento e a data de pagamento da despesa.

## Executar

Com Node.js 24 e npm instalados, execute na raiz:

```sh
npm install
npm run build
```

Antes de iniciar, configure as variáveis no mesmo terminal. Exemplo em PowerShell:

```powershell
$env:GFMEI_USER = 'administrador'
$env:GFMEI_PASSWORD = Read-Host 'Senha do GF-MEI (mínimo de 12 caracteres)' -MaskInput
$env:GFMEI_JWT_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
npm start
```

Abra http://127.0.0.1:3000. O banco é criado em `data/gfmei.sqlite`. Para editar com recarga da interface, execute `npm run dev:api` e `npm run dev` em terminais separados e abra o endereço indicado pelo Vite.

## CRUD e estrutura

| Módulo | Responsabilidade |
|---|---|
| `src/domain` | Tipos, validação, casos de uso e contrato do repositório. |
| `src/server` | API HTTP, persistência SQLite e inicialização. |
| `src/web` | Interface React, formulários, relatórios e cliente HTTP. |
| `tests` | Testes das regras financeiras e da integração com SQLite. |

O domínio depende do contrato `Repository`. A implementação SQLite é escolhida na inicialização e injetada no domínio. As rotas Express delegam validações e cálculos ao domínio, e a interface consome a API.

Para serviços, despesas e recebimentos, a API expõe `POST /api/{recurso}`, `GET /api/{recurso}`, `GET /api/{recurso}/{id}`, `PUT /api/{recurso}/{id}` e `DELETE /api/{recurso}/{id}`. O DELETE cancela o lançamento e preserva o histórico. O resumo mensal é consultado em `GET /api/resumo/AAAA-MM`.

## Testes

Execute `npm test`. Os testes usam o executor nativo do Node.js e o SQLite em memória ou em um arquivo temporário. Cobrem valores inválidos, edição, recebimentos parciais, cancelamento, resultado mensal e persistência.

## Limites desta versão

O servidor escuta apenas no endereço local. A conta configurada no ambiente é a administradora. Na tela de login, **Criar conta** solicita usuário e senha. Na seção **Usuários**, o administrador aprova contas pendentes ou cria usuários com acesso imediato. As contas aprovadas acessam os mesmos lançamentos financeiros.

O JWT fica em um cookie HttpOnly com validade de oito horas. Sair revoga a sessão no servidor. Reiniciar o servidor encerra todas as sessões. Para acesso remoto, são necessários HTTPS e uma configuração própria de produção.

