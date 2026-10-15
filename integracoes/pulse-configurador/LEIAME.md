# Pulse Configurador → Engemase Pulse (nuvem) — módulo de envio versão 3

O **Pulse Configurador** (o antigo Painel), instalado no **gateway** de cada unidade,
continua fazendo tudo o que já faz: lê o Modbus,
guarda o histórico em SQLite, calcula alarmes e consumo e funciona sem internet.
Com o módulo `nuvem.js`, ele passa a **copiar** as leituras para a nuvem, onde o
cliente acessa pelo navegador ou pelo celular, com o login dele.

```
Gateway da unidade                              Nuvem (Vercel)
Configurador ── HTTPS, só de saída, 10 s ──▶   POST /api/ingest
  SQLite = fila do que falta enviar               medidores criados sozinhos
```

- **Nenhuma porta aberta na unidade** e nenhuma VPN para os dados: o gateway é que chama a nuvem.
- **Internet caiu:** a unidade segue normal; quando a conexão volta, o atraso sobe em lotes.
- **Os medidores nascem sozinhos na nuvem**, a partir dos equipamentos do grupo `energia`
  (nome, TAG ISA, entrada geral, disjuntor e endereço vêm do `config.json` do gateway).
- **Reservatório e grupo gerador também** (grupos `agua` e `gerador`), com os parâmetros
  da instalação e o histórico, e o configurador declara quais módulos a unidade usa (ver [Módulos](#módulos-energia-água-e-gerador)).
- **Os alarmes do configurador aparecem na nuvem** e avisam no celular de quem tem acesso
  ao cliente (prioridade média e alta).

## Instalar (no código do Pulse Configurador)

O código do configurador fica em
[EngemaseAutomacao/Pulse-Configurador](https://github.com/EngemaseAutomacao/Pulse-Configurador),
já com este módulo ligado no `server.js` e com a ligação pela interface (o técnico cola o
endereço e o token; ver o `NUVEM.md` de lá). Esta pasta guarda uma cópia do `nuvem.js` como
referência do formato do envio. Numa cópia antiga do configurador, sem o módulo:

1. Copie `nuvem.js` para `src/nuvem.js` do configurador.
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

3. No `config.json` do gateway (no configurador novo, também dá pela interface):

   ```json
   "nuvem": { "url": "https://engemase-pulse.vercel.app", "token": "pnl_…" }
   ```

   O token é gerado na nuvem em **Administração → Unidades → (a unidade) → Gerar token**. Ele aparece uma única vez; a própria
   tela mostra o trecho pronto para colar. Sem a seção `nuvem`, o módulo não faz nada.

   Opcionais: `"intervalo_s": 10` (envio ao vivo) e `"historico_inicial_dias": 7`
   (quanto do resumo de 5 min já gravado sobe no primeiro envio; o consumo por
   hora sobe inteiro).

## Módulos: energia, água e gerador

O Pulse Configurador diz à nuvem quais módulos a unidade usa, e o
**Engemase Pulse liga as telas sozinho** — ninguém precisa mexer na nuvem.

```jsonc
"nuvem": {
  "url": "https://engemase-pulse.vercel.app",
  "token": "pnl_…",
  "modulos": ["energia", "agua", "gerador"]   // opcional
}
```

* **Com `modulos`:** vale exatamente a lista. Serve para ligar o módulo antes de o
  equipamento existir (a tela do Pulse avisa que está aguardando) ou para deixar um
  equipamento só no gateway.
* **Sem `modulos`:** vale o que está configurado — energia se houver medidor de
  energia, água se houver reservatório (`caixa_agua.medidor` ou equipamento do grupo
  `agua`), gerador se houver grupo gerador (`gerador.medidor` ou grupo `gerador`).
* A equipe Engemase ainda pode **desligar** um módulo por cliente na administração do
  Pulse (cliente que não contratou). Ligar, quem liga é o configurador.

### Reservatório (módulo Água)

1. Cadastre o CLP do reservatório com um perfil do grupo `agua` (`clp-reservatorio`,
   só nível; ou `clp-utilidades`, com vazão de entrada, pressão e bomba).
2. Na seção `caixa_agua`, aponte o equipamento e informe a capacidade:

   ```json
   "caixa_agua": { "medidor": "reservatorio", "capacidade_litros": 20000, "altura_util_m": 2.5 }
   ```

   Sem `capacidade_litros` o Pulse mostra o nível, mas não calcula volume, consumo
   em m³, autonomia nem o aviso de vazamento.
3. O que o Pulse usa: `nivel` (%), e se existirem `vazao_entrada` (m³/h),
   `bomba_ligada`, `bomba_falha`, `pressao_recalque`, `boia_baixo`/`boia_alto`.
   Com a vazão de entrada o consumo é medido; só com o nível, ele é calculado pela
   descida do reservatório (e estimado enquanto a bomba enche).

### Grupo gerador (módulo Gerador)

1. Cadastre o controlador com um perfil do grupo `gerador` (`gerador-generico`,
   `dse-8620`, `dse-8620-via-clp`…).
2. Na seção `gerador`, aponte o equipamento e preencha a instalação:

   ```json
   "gerador": { "medidor": "gmg", "potencia_nominal_kw": 260, "capacidade_tanque_litros": 500, "consumo_litros_hora": 55 }
   ```

3. O Pulse mostra o que o motor de indicadores daqui já calcula (`pronto`,
   `autonomia_h`, `diesel_litros`, `dias_sem_teste`), o `estado`, as falhas
   (`falha_*`), o diesel, a bateria e a lista de **corridas** (tabela
   `gerador_corridas`: motivo, resultado, duração, litros, queda da bateria).

O rótulo, a unidade e as casas decimais de cada tag vão junto, então o Pulse escreve
igual à tela do configurador. Tags marcadas como `oculto` e equipamentos de outros grupos
(subestação, CLP de disjuntor…) ficam só aqui.

## O que é enviado

| Parte | Quando | De onde |
| --- | --- | --- |
| `equipamentos` | a cada 10 s | a última varredura (`ultimo.equipamentos`) + `principal`, `limites.corrente_a.max` e `conexao.unit_id` do config; em água e gerador, também `parametros` (seções `caixa_agua`/`gerador`) e `tags` (rótulo, unidade, casas) |
| `alarmes` | a cada 10 s, junto | os alarmes ativos (`ultimo.alarmes`, a lista inteira) |
| `alarmes_encerrados` | a cada minuto, o que falta | tabela `alarmes`, os já encerrados, pela ordem do `fim` |
| `resumo_5min` | a cada minuto, o que falta | tabela `resumo_5min` (energia, água e gerador), só janelas antes de `resumo_ate` (fechadas) |
| `consumo_horario` | a cada minuto, o que falta | tabela `consumo_horario`, pela ordem do `rowid` |
| `gerador_corridas` | a cada minuto, o que falta | tabela `gerador_corridas`, pela ordem do `id`; a em andamento vai de novo até terminar |
| `agente.modulos` | em todo envio | `nuvem.modulos` ou o que existe na configuração (ver Módulos) |

As marcas `nuvem_resumo_ate` e `nuvem_consumo_rowid` (tabela `marcas`) dizem até
onde a nuvem confirmou. Elas só avançam depois de um HTTP 200. O histórico só
começa a subir depois que a nuvem aceitou a lista de equipamentos naquela
execução: medidor que a nuvem ainda não conhece teria o histórico descartado.

O formato completo do envio está em `src/lib/agent-payload.ts` (nuvem) e a
tradução dos nomes das grandezas em `src/lib/painel-fields.ts`
(`tensao_an → V1N`, `corrente_a → I1`, `potencia_ativa → Total_kW`, `thd_corrente → THD_I1`…).
Grandeza nova num perfil: acrescente nessa tabela para ela aparecer na nuvem.

## Alarmes

Os alarmes continuam sendo configurados e detectados no configurador (limites, atraso
de confirmação e banda morta são os dele). A cada envio ao vivo vai a lista
inteira dos ativos, e a nuvem só espelha:

| No configurador | Na nuvem |
| --- | --- |
| alarme novo na lista | abre o alarme (marcado "Gateway da unidade") e notifica no celular se a prioridade for `media` ou `alta` |
| some da lista | fecha (normalizado) |
| `reconhecido` | marca como reconhecido no gateway |
| encerrado (com `fim`) | acerta o horário do fim; se a nuvem nunca soube dele (abriu e fechou com a internet fora), entra no histórico, sem notificar |
| reconhecido **na nuvem** | volta na resposta do envio e o configurador reconhece também (auditoria do configurador: “pela nuvem”) |

Prioridade: `alta` → Crítico, `media` → Atenção, `baixa` → Informativo. Alarme de
equipamento que não é medidor (gerador, CLP…) também aparece, sem link para medidor.
Como vai a lista inteira, uma queda de internet se acerta no primeiro envio
seguinte. A marca `nuvem_alarmes_fim` / `nuvem_alarmes_id` diz até onde os
encerrados já foram; no primeiro envio sobem os dos últimos `historico_inicial_dias`.

## Quando algo não chega

O módulo escreve no log do serviço (`journalctl -u supervisorio`) só quando o
estado muda:

| Mensagem | Causa |
| --- | --- |
| `[nuvem] HTTP 401: Token inválido ou revogado` | token errado ou gerado de novo na nuvem |
| `[nuvem] sem conexão com a nuvem (…)` | internet da unidade, DNS ou firewall bloqueando a saída HTTPS |
| `[nuvem] lote recusado e pulado (HTTP 400 …)` | dado fora do formato; o lote é pulado para não travar a fila |
| `[nuvem] alarmes: …` | a nuvem recebeu as leituras mas não conseguiu registrar os alarmes (tenta de novo a cada envio) |
| `[nuvem] envio restabelecido` | voltou ao normal |

Depois de uma falha, o módulo espera 10 s, 20 s, 40 s… até 5 min antes de tentar
de novo. A nuvem mostra o horário do último envio na tela da unidade.

`nuvem.estado()` devolve `{ ativa, ultimo_sucesso, erro }`, caso queira mostrar na
tela de Engenharia.

## Atualizar da versão 2 para a 3

Troque o `src/nuvem.js` pelo deste pacote e reinicie o serviço — o `server.js` não muda.
Atualize primeiro a nuvem (o Engemase Pulse já em produção aceita a versão 3); a versão 3
falando com uma nuvem antiga só teria os dados de água e gerador ignorados.
