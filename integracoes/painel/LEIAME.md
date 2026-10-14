# Painel local → Monitor de Energia (nuvem)

O Painel (supervisório da loja) continua fazendo tudo o que já faz: lê o Modbus,
guarda o histórico em SQLite, calcula alarmes e consumo e funciona sem internet.
Com o módulo `nuvem.js`, ele passa a **copiar** as leituras para a nuvem, onde o
cliente acessa pelo navegador ou pelo celular, com o login dele.

```
Loja (mini PC)                                  Nuvem (Vercel)
Painel ── HTTPS, só de saída, a cada 10 s ──▶   POST /api/ingest
  SQLite = fila do que falta enviar               medidores criados sozinhos
```

- **Nenhuma porta aberta na loja** e nenhuma VPN para os dados: o Painel é que chama a nuvem.
- **Internet caiu:** a loja segue normal; quando a conexão volta, o atraso sobe em lotes.
- **Os medidores nascem sozinhos na nuvem**, a partir dos equipamentos do grupo `energia`
  (nome, TAG ISA, entrada geral, disjuntor e endereço vêm do `config.json` da loja).

## Instalar (no código do Painel)

1. Copie `nuvem.js` para `src/nuvem.js` do Painel.
2. No `server.js`, quatro linhas:

   ```js
   // junto dos outros imports
   import { Nuvem } from './src/nuvem.js';

   // depois de "const versaoDoPainel = …"
   const nuvem = new Nuvem(() => config, banco, { versao: versaoDoPainel });

   // em varrer(), logo depois de transmitir();
   nuvem.aoVivo(ultimo);

   // no tratamento de SIGINT/SIGTERM, junto de coletor.encerrar?.();
   nuvem.parar();
   ```

   `() => config` (e não `config`) é proposital: quando a Engenharia aplica uma
   configuração nova, o módulo já enxerga a lista nova de equipamentos.

3. No `config.json` da loja:

   ```json
   "nuvem": { "url": "https://ENDERECO-DA-NUVEM", "token": "pnl_…" }
   ```

   O token é gerado na nuvem em **Administração → Unidades → (a unidade) → Fonte
   das leituras: Painel local → Gerar token**. Ele aparece uma única vez; a própria
   tela mostra o trecho pronto para colar. Sem a seção `nuvem`, o módulo não faz nada.

   Opcionais: `"intervalo_s": 10` (envio ao vivo) e `"historico_inicial_dias": 7`
   (quanto do resumo de 5 min já gravado sobe no primeiro envio; o consumo por
   hora sobe inteiro).

## O que é enviado

| Parte | Quando | De onde |
| --- | --- | --- |
| `equipamentos` | a cada 10 s | a última varredura (`ultimo.equipamentos`) + `principal`, `limites.corrente_a.max` e `conexao.unit_id` do config |
| `resumo_5min` | a cada minuto, o que falta | tabela `resumo_5min`, só janelas antes de `resumo_ate` (fechadas) |
| `consumo_horario` | a cada minuto, o que falta | tabela `consumo_horario`, pela ordem do `rowid` |

As marcas `nuvem_resumo_ate` e `nuvem_consumo_rowid` (tabela `marcas`) dizem até
onde a nuvem confirmou. Elas só avançam depois de um HTTP 200. O histórico só
começa a subir depois que a nuvem aceitou a lista de equipamentos naquela
execução: medidor que a nuvem ainda não conhece teria o histórico descartado.

O formato completo do envio está em `src/lib/agent-payload.ts` (nuvem) e a
tradução dos nomes das grandezas em `src/lib/painel-fields.ts`
(`tensao_an → V1N`, `corrente_a → I1`, `potencia_ativa → Total_kW`, `thd_corrente → THD_I1`…).
Grandeza nova num perfil: acrescente nessa tabela para ela aparecer na nuvem.

## Quando algo não chega

O módulo escreve no log do serviço (`journalctl -u supervisorio`) só quando o
estado muda:

| Mensagem | Causa |
| --- | --- |
| `[nuvem] HTTP 401: Token inválido ou revogado` | token errado ou gerado de novo na nuvem |
| `[nuvem] HTTP 409: A unidade não está configurada…` | na nuvem, a unidade não está salva com a fonte "Painel local" |
| `[nuvem] sem conexão com a nuvem (…)` | internet da loja, DNS ou firewall bloqueando a saída HTTPS |
| `[nuvem] lote recusado e pulado (HTTP 400 …)` | dado fora do formato; o lote é pulado para não travar a fila |
| `[nuvem] envio restabelecido` | voltou ao normal |

Depois de uma falha, o módulo espera 10 s, 20 s, 40 s… até 5 min antes de tentar
de novo. A nuvem mostra o horário do último envio na tela da unidade.

`nuvem.estado()` devolve `{ ativa, ultimo_sucesso, erro }`, caso queira mostrar na
tela de Engenharia.
