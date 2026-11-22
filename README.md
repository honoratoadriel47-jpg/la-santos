# LA SANTOS — Agendamento online

Sistema de agendamento próprio da LA SANTOS Barbearia, desenvolvido pela Pulso Agency.

- **Site do cliente** (`/`): vinheta com a logo (sempre que o site é aberto) → serviço → profissional (se houver equipe) → data → horário → dados → revisão → confirmação com código.
- **Portfólio** (`/portfolio`): fotos dos trabalhos em mosaico, com ampliação em tela cheia. A opção "Portfólio" fica sempre no topo e no rodapé do site.
- **Painel** (`/admin`): agenda por dia / 7 dias / profissional, cancelamento, serviços e preços, portfólio (enviar, legendar, ordenar e excluir fotos — só o painel tem acesso), equipe, horários de funcionamento, bloqueios de horário/data, dados da barbearia.

Sem frameworks e sem dependências de produção: HTML + CSS + JavaScript (ES modules) no navegador e uma função Node.js na Vercel. Nada para compilar.

## Publicar na Vercel (≈10 min)

1. Suba esta pasta para um repositório no GitHub e importe na Vercel (Framework: **Other**, sem build).
2. **Banco de dados**: no projeto da Vercel, aba **Storage → Create → Upstash (Redis)**, plano gratuito, e conecte ao projeto. A Vercel cria sozinha `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
   (Também funciona com uma conta Upstash direta: `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.)
3. **Senha do painel**: em Settings → Environment Variables, crie `ADMIN_PASSWORD` com uma senha forte.
   Opcional: `SESSION_SECRET` (texto aleatório longo) para assinar as sessões.
4. Faça o deploy e acesse `/admin` para completar o que falta (veja abaixo).

Sem o banco configurado, o site **não finge** confirmar: a API responde "agendamento indisponível".

## O que ainda falta preencher (pelo painel)

| Item | Onde |
| --- | --- |
| Horário de funcionamento real (hoje: padrão provisório ter–sex 9h–19h, sáb 8h–17h) | Horários → marcar "Estes são os horários reais" |
| Profissionais (opcional — sem equipe, a agenda é única) | Equipe |

Endereço (R. Miguel Couto, 471 - Palmital, Linhares - ES), Instagram (@la_santosbarbearia) e WhatsApp ((27) 99512-5793) já vêm preenchidos. Os 24 serviços, valores e durações já estão cadastrados (`lib/default-config.js` é só o ponto de partida; depois tudo é editado no painel).

## Como a disponibilidade funciona

`lib/availability.js` é a fonte única de verdade. Um horário só é oferecido se cabe inteiro (duração do serviço + folga) dentro do expediente do dia e do profissional, sem tocar em intervalos, bloqueios ou agendamentos confirmados, respeitando antecedência mínima e janela de dias.

Ao confirmar, o servidor **refaz a verificação dentro de uma trava por dia** (lock no Redis com `SET NX PX` e liberação atômica), então dois clientes nunca ficam com o mesmo horário. Envio duplicado do mesmo pedido é ignorado (`requestId`), e o mesmo telefone não marca horários sobrepostos.

## Portfólio

As fotos são reduzidas no navegador antes do envio (lado maior 1600 px + miniatura 640 px, WebP ou JPEG) e ficam no mesmo Upstash, em chaves separadas. Uma foto de celular de 3–5 MB vira algo entre 100 e 400 KB. Limite de 80 fotos (ajustável em `lib/portfolio.js`). O servidor confere o tipo real do arquivo e recusa qualquer coisa que não seja JPEG/WebP; as imagens são servidas com cache longo.

## Segurança

- Painel com sessão assinada (HMAC-SHA256) em cookie `HttpOnly; Secure; SameSite=Strict` + cabeçalho anti-CSRF em toda escrita.
- Limite de tentativas de login (8 a cada 15 min por IP) e de agendamentos por IP.
- Dados de clientes só saem pela API do painel; a resposta pública devolve apenas o resumo do próprio agendamento.
- Todo dado recebido é validado e saneado no servidor.

## Rodar localmente

```bash
node server.js            # http://localhost:3000  · painel: /admin  · senha dev: lasantos-dev
node --test tests/*.test.js
```

Localmente os dados ficam em `data/db.json` (ou no Upstash, se as variáveis existirem).

`node scripts/build-demo.mjs` gera `dist-demo/`, uma versão de apresentação que roda só no navegador (dados no localStorage). Não é para produção.

## Estrutura

```
api/index.js            função serverless (todas as rotas /api/v1/*)
lib/app.js              rotas da API
lib/availability.js     cálculo de horários livres
lib/validate.js         validação e saneamento
lib/auth.js             sessão do painel
lib/portfolio.js        fotos do portfólio
lib/store/upstash.js    banco em produção (Redis via REST)
lib/store/file.js       banco local (desenvolvimento)
public/                 site, painel, estilos e assets da logo
tests/                  testes da API, concorrência e adaptador Upstash
```
