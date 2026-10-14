# Monitor de Energia

Plataforma multi-cliente para monitorar **multimedidores de energia** em tempo real.
Cada cliente tem seu login, sua marca (logo e cores) e suas unidades; cada unidade recebe as
leituras do **Painel local**, o supervisório instalado na loja.

> O nome é provisório: troque em [`src/config/app.ts`](src/config/app.ts).

```
Multimedidores ──RS485/Modbus──▶ Painel local (mini PC na loja, SQLite)
                                        │  HTTPS, só de saída (POST /api/ingest)
                                        ▼
                Next.js na Vercel (São Paulo) ◀──▶ Neon Postgres (cadastros, histórico, alarmes)
                                 │                  Upstash Redis (leitura atual, cache)
                 Navegador / app instalado (PWA) · notificações push
```

## O que tem

- **Painel do cliente**: potência, FP global, medidores online, cartões ao vivo (atualiza a cada 10 s).
- **Detalhe do medidor**: tabela por fase (V, A, kW, kVA, kVAr, FP), THD, neutro e demanda, histórico
  com período e grandeza selecionáveis, consumo por hora/dia/mês (no fuso da unidade) e CSV para Excel.
- **Consumo por setor**: consumo do dia hora a hora, hora de pico, maior setor, participação de cada
  setor e o **não medido** (entrada geral menos a soma dos alimentadores).
- **Alarmes**: regras por cliente/medidor (limite de grandeza ou "sem comunicação"), histórico,
  reconhecimento pelo operador e **notificação push** no celular/computador.
- **Administração** (equipe da plataforma): clientes com logo/cores e login próprio em `/login/<slug>`,
  unidades com o token do Painel local, medidores (criados pelo Painel) e usuários com papéis por cliente.
- **PWA**: instalável no Android, iOS e desktop; página offline; aviso de "sem conexão".
- **Responsivo** do celular ao monitor grande; tema escuro com a identidade Engemase.
- **Painel local**: o supervisório instalado na loja lê o Modbus e envia as leituras para a nuvem,
  sem porta aberta na loja. Ver [Painel local](#painel-local-supervisório-da-loja).

## Stack

| Camada | Tecnologia |
| --- | --- |
| App (SSR, API, Server Actions) | Next.js 16 (App Router, Cache Components) · React 19 · TypeScript estrito |
| UI | Tailwind CSS 4 · shadcn/ui (Radix) · Recharts · SWR |
| Banco | PostgreSQL via **Prisma 7** (produção: **Neon**, região São Paulo) |
| Telemetria | Painel local (supervisório da loja), envio por HTTPS para `/api/ingest` |
| Autenticação | Própria: scrypt + sessão no banco (cookie `httpOnly`), limite de tentativas |
| Push | Web Push (VAPID) com `web-push` |
| Testes / qualidade | Vitest · ESLint · Prettier · GitHub Actions |

## Papéis

| Papel | Pode |
| --- | --- |
| Visualizador | Ver painéis, medidores e alarmes do cliente |
| Operador | + exportar CSV e reconhecer alarmes |
| Administrador (do cliente) | + criar/editar regras de alarme |
| Equipe da plataforma | Tudo, em todos os clientes, e a área `/admin` |

Notificações push vão para os usuários **vinculados ao cliente** que ativaram o aparelho em
*Minha conta*. Quem é da equipe da plataforma e quer receber de um cliente deve ser vinculado a ele.

## Rodando localmente

Requisitos: Node 22+ (recomendado 24).

```bash
npm install
cp .env.example .env
npm run db:local            # sobe um Postgres local (prisma dev) — deixe rodando
```

Copie a URL `postgres://…` exibida para `DATABASE_URL` no `.env` (e a porta seguinte em
`SHADOW_DATABASE_URL`). Gere as chaves das notificações push:

```bash
npx web-push generate-vapid-keys
```

Depois:

```bash
npm run db:migrate          # cria as tabelas
npm run db:seed             # primeiro administrador (SEED_ADMIN_* do .env)
npm run dev                 # http://localhost:3000
```

Entre com `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` do `.env`. Para ver leituras, crie uma unidade,
gere o token e rode o Painel em modo demonstração (`npm run demo` no Painel) apontando para
`http://localhost:3000`.

## Deploy na Vercel

1. Suba o projeto para um repositório Git e importe na Vercel (framework detectado: Next.js).
   O build usa o script `vercel-build`: gera o client, **aplica as migrations**, cria o primeiro
   administrador (passo 4) e compila.
2. Em **Storage → Neon → Create**, escolha a região **São Paulo (aws-sa-east-1)** e conecte ao projeto.
   A região **não pode ser trocada depois**. A integração cria `DATABASE_URL` (com pool, usada pelo app)
   e `DATABASE_URL_UNPOOLED` (direta, usada nas migrations). As funções já rodam em São Paulo (`gru1`,
   em [`vercel.json`](vercel.json)), perto do banco.
3. Em **Storage → Upstash → Redis**, crie um banco (região São Paulo, se houver) e conecte ao projeto.
   É o cache compartilhado das leituras e do estado dos alarmes (cria `KV_REST_API_URL`/`KV_REST_API_TOKEN`).
   Sem ele o sistema funciona, mas cada instância tem seu próprio cache e o banco trabalha mais.
4. Em **Settings → Environment Variables**, adicione:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:seu@email`).
   - `CRON_SECRET` — texto aleatório longo (protege o avaliador de alarmes).
   - `SESSION_TTL_DAYS` (opcional, padrão 7).
   - `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` (mín. 10 caracteres) — o primeiro administrador.
     **Sem elas o banco fica sem nenhum usuário e todo login dá "E-mail ou senha incorretos."**
5. Faça o deploy (ou **Redeploy**, se as variáveis foram adicionadas depois). O log do build mostra
   `✔ Administrador criado: …`; entre em `/login` com esse e-mail e senha. Se faltar a senha ou ela
   tiver menos de 10 caracteres, o deploy segue e o log mostra `⚠ Administrador não criado: …`.

   Uma conta que já existe nunca é alterada — mudar `SEED_ADMIN_PASSWORD` depois **não** troca a senha
   (use *Minha conta*). Depois do primeiro login, troque a senha lá e apague `SEED_ADMIN_PASSWORD` da Vercel.
   Para criar o administrador sem novo deploy, rode o seed da sua máquina apontando para o banco de produção:

   ```bash
   DATABASE_URL="postgres://…" SEED_ADMIN_EMAIL="voce@engemase.com.br" SEED_ADMIN_PASSWORD="…" npm run db:seed
   ```

### Avaliador de alarmes (cron)

As regras são avaliadas pela rota `/api/cron/alarms` (GET ou POST). Ela aceita
`Authorization: Bearer <CRON_SECRET>` ou a assinatura do Upstash QStash. Escolha **uma** forma de chamá-la:

- **Upstash QStash (recomendado em qualquer plano)** — no console do QStash, crie um *Schedule* para
  `https://SEU_DOMINIO/api/cron/alarms` com `*/5 * * * *`. Copie as chaves `QSTASH_CURRENT_SIGNING_KEY` e
  `QSTASH_NEXT_SIGNING_KEY` para as variáveis da Vercel. Tem reenvio automático se a chamada falhar.
- **Vercel Pro** — adicione ao `vercel.json`:
  `"crons": [{ "path": "/api/cron/alarms", "schedule": "*/5 * * * *" }]` (a Vercel envia o `CRON_SECRET`).
  No plano Hobby o cron nativo roda no máximo 1x por dia.
- **GitHub Actions** — o workflow [`.github/workflows/alarms-cron.yml`](.github/workflows/alarms-cron.yml)
  chama a rota (secrets `APP_URL` e `CRON_SECRET`). O agendamento do GitHub pode atrasar alguns minutos.
- Na tela **Alarmes**, administradores também têm o botão **Verificar agora**.

A tela inicial da **Administração** mostra a última execução do avaliador e alerta se ele parar de rodar.

## Escalabilidade

O sistema foi preparado para muitos clientes, unidades e medidores sem gargalo de dados:

- **Leituras ao vivo em cache compartilhado** (Upstash Redis): o envio do Painel vai para o cache, e as
  telas leem de lá no máximo uma vez a cada ~5 s por unidade, não importa quantas estejam abertas.
- **Cadastro em cache**: unidades e medidores são lidos do cache e invalidados na hora quando a
  administração altera algo. As atualizações das telas quase não usam o Postgres.
- **Respostas enxutas**: painel e tabela recebem só os campos de resumo; o detalhe recebe um medidor.
  As listas têm busca, ordenação ("problemas primeiro") e carregamento em blocos.
- **Avaliador de alarmes sem carga no banco**: regras e alarmes abertos ficam no cache, e as leituras vêm
  do mesmo cache das telas. O Postgres só é usado quando um alarme abre ou normaliza. Vários clientes
  são avaliados em paralelo, com limite de tempo e rodízio. A coluna única `open_key` impede alarmes
  duplicados, mesmo com execuções simultâneas.
- **Histórico resumido**: a nuvem guarda médias de 5 min (não cada leitura) e o consumo por hora já
  calculado pelo Painel; gráficos longos agregam isso no Postgres.

## Painel local (supervisório da loja)

Cada loja roda o **Painel** (supervisório Node.js com SQLite, em um mini PC ligado à RS-485). Ele continua sendo a
referência na loja — leitura Modbus, perfis de equipamento, alarmes, tela local, funciona
sem internet — e **copia** as leituras para a nuvem:

```
Multimedidores ──RS485/Modbus──▶ Painel (mini PC, SQLite) ──HTTPS, só de saída──▶ POST /api/ingest
```

1. Em **Administração → Unidades**, crie a unidade e clique em **Gerar token**.
   O token aparece uma única vez (no banco fica só o SHA-256), já com o trecho do `config.json`.
2. No Painel, instale o módulo de envio: [`integracoes/painel/`](integracoes/painel/LEIAME.md).
3. No primeiro envio, os **medidores são criados sozinhos** a partir dos equipamentos de energia
   do Painel (nome, TAG ISA, entrada geral, disjuntor, endereço Modbus).

O que a nuvem guarda de cada unidade com Painel local:

| Dado | Onde | Retenção |
| --- | --- | --- |
| Leitura atual (a cada ~10 s) | Upstash Redis (sem Redis: tabela `site_live_snapshots`) | último envio |
| Resumo de 5 min (média, mín., máx.) | `meter_readings_5m` | 400 dias |
| Consumo por hora, já calculado pelo Painel (contador ou estimado pela potência) | `meter_energy_hours` | para sempre |

A energia vem do contador lido corretamente pelo Painel (float32 na ordem CDAB do Siemens 7KT),
sem os saltos de 1024 kWh de gateways que leem a ordem errada. O formato do envio está em [`src/lib/agent-payload.ts`](src/lib/agent-payload.ts)
e a tradução das grandezas em [`src/lib/painel-fields.ts`](src/lib/painel-fields.ts).

## Notificações push e instalação (PWA)

- Funcionam em Chrome/Edge/Firefox (desktop e Android) e Safari 16+ no macOS.
- **iPhone/iPad (iOS 16.4+)**: só depois de instalar — Safari → Compartilhar → *Adicionar à Tela de Início*,
  abrir pelo ícone e ativar em *Minha conta*.
- Exigem HTTPS (na Vercel já é). Localmente, `localhost` também é aceito pelos navegadores.
- Alarmes de severidade **Atenção** e **Crítico** geram push; **Informativo** fica só no sistema.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `start` | Build e execução de produção |
| `npm run lint` · `typecheck` · `test` | Qualidade (também rodam no CI) |
| `npm run db:local` | Postgres local (`prisma dev`) |
| `npm run db:migrate` | Cria/aplica migrations no desenvolvimento |
| `npm run db:deploy` | Aplica migrations em produção |
| `npm run db:seed` | Primeiro administrador |
| `npm run db:studio` | Navegar no banco |
| `npm run icons` | Regera os ícones do PWA a partir do logo |

## Estrutura

```
prisma/                 schema, migrations e seed
src/
  app/                  rotas (App Router)
    login/              login geral e /login/<slug> com a marca do cliente
    app/[tenant]/       área do cliente: visão geral, medidores, consumo, alarmes, conta
    admin/              administração da plataforma
    api/                leituras (live/history/energy/consumption/export), logo, cron, ingest do Painel
  components/           UI (shell, gráficos, medidores, alarmes, formulários, pwa)
  lib/                  código compartilhado: campos do medidor, validação, períodos, alarmes
  server/               só servidor: auth (DAL), banco, cripto, Painel local (agent), telemetria, push
public/sw.js            service worker (push + offline)
integracoes/painel/     módulo de envio para o Painel local (vai no supervisório da loja)
```

Princípios: verificação de acesso perto dos dados (DAL em `src/server/auth/dal.ts`), toda entrada
validada com zod, tokens só como hash no banco, segredos nunca enviados ao navegador,
alterações administrativas registradas em auditoria.

## Banco: Neon gratuito → pago

Mudar de plano no Neon **não exige mudança no sistema**: o projeto, os dados e as URLs de conexão
continuam os mesmos. O que não muda nunca é a região — por isso ela é escolhida na criação.

No plano gratuito o banco "dorme" após 5 min sem uso e há uma cota mensal de processamento; se ela
acabar, o Neon suspende o banco até o mês seguinte. **Com o Upstash Redis configurado**, o avaliador de
alarmes não acorda o banco enquanto nada muda — só o uso real das telas consome a cota. Sem Redis, cada
execução consulta o banco; nesse caso, agende o avaliador a cada 15 min em vez de 5.
