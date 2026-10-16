/**
 * Conteúdo da Ajuda: manual do usuário (uma seção por tela) e perguntas
 * frequentes. Texto simples; **negrito** é o único destaque aceito.
 * Ao mudar uma tela, atualize a seção dela aqui.
 */

export type HelpBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "tip"; text: string };

export type HelpIcon =
  | "start"
  | "overview"
  | "meters"
  | "history"
  | "single-line"
  | "consumption"
  | "bill"
  | "targets"
  | "stores"
  | "compare"
  | "alarms"
  | "notices"
  | "tv"
  | "users"
  | "account"
  | "water"
  | "generator"
  | "setup"
  | "admin";

export type HelpSection = {
  id: string;
  title: string;
  icon: HelpIcon;
  summary: string;
  blocks: HelpBlock[];
  /** Caminho da tela, relativo à área do cliente (/app/<cliente>); "@tv" = tela de TV. */
  path?: string;
  /** Só para a equipe da plataforma (Engemase). */
  adminOnly?: boolean;
  /** Só aparece para clientes com o módulo. */
  module?: "agua" | "gerador";
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string[];
  /** Seção do manual relacionada. */
  section?: string;
  adminOnly?: boolean;
  module?: "agua" | "gerador";
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    icon: "start",
    summary: "Entrar, instalar como aplicativo, tema e notificações.",
    blocks: [
      {
        kind: "p",
        text: "O sistema mostra, ao vivo, as leituras dos multimedidores das suas unidades. Quem envia os dados é o **gateway**, o computador instalado em cada unidade: o Pulse Configurador, que roda nele, lê os medidores e manda para a nuvem a cada poucos segundos.",
      },
      {
        kind: "steps",
        items: [
          "Entre com o e-mail e a senha que você recebeu (no convite, você mesmo define a senha).",
          "Na primeira vez, abra **Minha conta** e ative as **notificações** neste aparelho para receber os alarmes.",
          "Para usar como aplicativo: no computador, no Chrome ou Edge, clique no ícone de instalar na barra de endereço; no Android, menu ⋮ › Instalar app; no iPhone, Safari › Compartilhar › Adicionar à Tela de Início.",
          "Escolha o tema no menu do seu nome (canto inferior esquerdo): Automático, Claro ou Escuro.",
        ],
      },
      {
        kind: "tip",
        text: "No celular, toque no ícone de menu (☰) no alto da tela para abrir as opções.",
      },
    ],
  },
  {
    id: "visao-geral",
    title: "Visão geral",
    icon: "overview",
    path: "",
    summary: "Potência, fator de potência, alarmes ativos e um cartão por medidor.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Alarmes ativos** no topo, com atalho para a tela de alarmes.",
          "**Demanda agora** (unidades com tarifa verde ou azul): a média que a janela de 15 minutos em andamento deve fechar, comparada com a demanda contratada. A linha cheia é a contratada; a tracejada, o limite com a tolerância de 5 %.",
          "**Indicadores**: potência ativa e aparente, fator de potência global e quantos medidores estão online. Quando há entrada geral, ela é usada nos totais (os alimentadores já estão dentro dela).",
          "**Cartões dos medidores**: potência, corrente, tensão, fator de potência e, com disjuntor cadastrado, a carga em % do disjuntor.",
        ],
      },
      {
        kind: "p",
        text: "Estados de cada medidor: **Online** (leitura recente), **Sem comunicação** (o medidor ou a unidade parou de enviar; o valor mostrado é o último recebido) e **Sem leituras** (nunca enviou). A tela atualiza sozinha a cada 10 segundos.",
      },
    ],
  },
  {
    id: "medidores",
    title: "Medidores e histórico",
    icon: "history",
    path: "/medidores",
    summary: "Leituras por fase, histórico com penas configuráveis e consumo.",
    blocks: [
      {
        kind: "p",
        text: "A lista mostra todos os medidores com a leitura atual. Clique num medidor para ver o detalhe: tensões, correntes e potências por fase, THD, frequência, energia e o cadastro.",
      },
      {
        kind: "p",
        text: "No **Histórico** (gráfico de tendência):",
      },
      {
        kind: "list",
        items: [
          "Escolha a **grandeza** (potência, correntes, tensões, fator de potência…) e o **período** (1 h a 30 dias).",
          "**Penas**: clique no nome de uma pena (L1, L2, Total…) para ocultar ou mostrar; na bolinha ao lado, troque a cor. As escolhas ficam salvas neste navegador.",
          "**Zoom**: arraste sobre o gráfico para aproximar um trecho; **Desfazer zoom** volta.",
          "**Setas** voltam ou avançam um período; **Período…** abre de/até com data e hora.",
          "**Comparar com anterior** desenha, tracejado, o período anterior de mesmo tamanho (ex.: hoje × ontem).",
          "**Opções**: linhas de limite (faixa normal, disjuntor) e eixo começando no zero. O botão de **ampliar** ocupa a tela toda (Esc volta).",
          "A tabela abaixo mostra mínimo, média, máximo e último valor de cada pena, com o horário.",
          "**CSV** baixa os dados do período exibido para abrir no Excel (operador ou administrador).",
        ],
      },
      {
        kind: "tip",
        text: "Os valores do histórico são médias de 5 minutos: picos mais curtos que isso não aparecem.",
      },
    ],
  },
  {
    id: "unifilar",
    title: "Unifilar",
    icon: "single-line",
    path: "/unifilar",
    summary: "Desenho da instalação com potência e carga de cada setor, ao vivo.",
    blocks: [
      {
        kind: "p",
        text: "Mostra a entrada da concessionária, o barramento e cada setor (alimentador) com disjuntor, potência atual e **% de carga**. O **Não medido** é a diferença entre a entrada geral e a soma dos setores: cargas que não têm medidor próprio e perdas.",
      },
    ],
  },
  {
    id: "consumo",
    title: "Consumo",
    icon: "consumption",
    path: "/consumo",
    summary: "kWh por setor no dia (hora a hora) e no mês (dia a dia), com custo.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Dia**: consumo hora a hora de cada setor, horário de pico e participação de cada setor.",
          "**Mês**: dia a dia, com custo em R$ por setor (quando a tarifa está cadastrada) e comparação com o mês anterior e com o mesmo mês do ano passado (mesmo trecho, quando o mês está em andamento).",
          "A **planilha** baixa os números para o Excel.",
        ],
      },
      {
        kind: "p",
        text: "Horas marcadas como **estimadas** foram calculadas pela potência média, porque o contador de energia do medidor não estava disponível naquela hora.",
      },
    ],
  },
  {
    id: "fatura",
    title: "Fatura, simulador e capacitores",
    icon: "bill",
    path: "/fatura",
    summary: "Fatura estimada do mês, simulador de tarifa e fator de potência.",
    blocks: [
      {
        kind: "p",
        text: "A **Fatura estimada** usa as medições e a tarifa cadastrada da unidade: energia na ponta e fora ponta (a ponta só vale em dias úteis, sem feriados nacionais), demanda faturada (a maior entre a medida e a contratada), **ultrapassagem** (o que passa da contratada além de 5 % é cobrado em dobro), excedente de reativo (fator de potência abaixo de 0,92, só Grupo A) e impostos. No mês em andamento aparece a **projeção** para o mês inteiro.",
      },
      {
        kind: "p",
        text: "**Simular tarifa e demanda**: com os últimos 12 meses medidos, compara quanto a unidade pagaria em cada modalidade (verde × azul no Grupo A; convencional × branca no Grupo B) e calcula a **demanda contratada ideal**. Os preços da tarifa cadastrada já vêm preenchidos; os da outra modalidade você digita a partir da tabela da distribuidora.",
      },
      {
        kind: "p",
        text: "**Fator de potência e capacitores**: com os últimos 30 dias, indica quantos kVAr de capacitor a entrada precisa para ficar acima de 0,92 e a economia estimada por mês. É um dimensionamento preliminar: confirme com um técnico antes de instalar.",
      },
      {
        kind: "p",
        text: "**Relatório do mês** abre uma página pronta para imprimir ou salvar em PDF (use Imprimir › Salvar como PDF).",
      },
      {
        kind: "p",
        text: "Além do relatório de energia, há outros no mesmo formato, trocados pelas abas no topo da página: **Demanda e fator de potência** (a maior demanda de cada dia contra a contratada, os maiores picos e as horas abaixo de 0,92), **Gerador** (teste semanal, partidas, tempo pronto para partir, diesel e bateria), **Água** (consumo em m³ por dia, madrugadas com suspeita de vazamento, bomba e nível) e o **Comparativo entre unidades**. As telas Gerador, Água e Ranking também têm o botão do relatório.",
      },
    ],
  },
  {
    id: "metas",
    title: "Metas",
    icon: "targets",
    path: "/metas",
    summary: "Meta mensal de kWh e de R$ por unidade e por setor.",
    blocks: [
      {
        kind: "p",
        text: "Para cada unidade (entrada geral) e cada setor, mostra o consumo até agora, a **projeção** para o mês inteiro e a situação contra a meta: **Dentro da meta**, **Perto da meta** (acima de 90 %) ou **Acima da meta**. A partir do dia 5, se a projeção passar da meta, abre um alarme.",
      },
      {
        kind: "p",
        text: "Só o **administrador** do cliente define as metas: digite o valor e clique em **Salvar**; deixe o campo vazio para tirar a meta. A meta em R$ precisa da tarifa cadastrada.",
      },
    ],
  },
  {
    id: "ranking",
    title: "Ranking de unidades",
    icon: "stores",
    path: "/ranking",
    summary: "As unidades lado a lado: kWh/m², custo, variação, FP e demanda.",
    blocks: [
      {
        kind: "p",
        text: "Aparece para clientes com duas ou mais unidades. Escolha o indicador (kWh por m², consumo, custo, R$ por m², variação contra o mês anterior, fator de potência ou demanda sobre a contratada); a melhor unidade vem primeiro. Para kWh/m², a área de cada unidade precisa estar cadastrada (peça à Engemase).",
      },
    ],
  },
  {
    id: "comparar",
    title: "Comparar medidores",
    icon: "compare",
    path: "/comparar",
    summary: "Até 3 medidores no mesmo gráfico, da mesma unidade ou de unidades diferentes.",
    blocks: [
      {
        kind: "p",
        text: "Adicione até três medidores, escolha a grandeza e o período. O resumo mostra mínimo, média e máximo de cada um. O endereço da página guarda a seleção: dá para copiar e mandar para alguém.",
      },
    ],
  },
  {
    id: "alarmes",
    title: "Alarmes",
    icon: "alarms",
    path: "/alarmes",
    summary: "Tipos de alarme, severidade, reconhecimento e regras.",
    blocks: [
      {
        kind: "p",
        text: "Severidades: **Crítico**, **Atenção** e **Informativo**. Crítico e Atenção geram notificação; Informativo fica só na tela.",
      },
      {
        kind: "list",
        items: [
          "**Do gateway da unidade**: os alarmes configurados no gateway chegam aqui e fecham sozinhos; reconhecer aqui reconhece lá também.",
          "**Regras da nuvem**: limite de uma grandeza (ex.: corrente acima de X) ou medidor sem enviar há N minutos. O administrador cria em Alarmes › Regras.",
          "**Automáticos**: unidade sem comunicação (10 min sem envio), demanda vai passar da contratada (aviso no meio da janela de 15 min), demanda acima da contratada no mês, consumo fora do padrão e projeção acima da meta.",
        ],
      },
      {
        kind: "p",
        text: "**Reconhecer** (operador ou administrador) registra quem viu o alarme. Se o cliente usa **escalonamento**, um alarme que ninguém reconhece no prazo é enviado para as pessoas responsáveis.",
      },
    ],
  },
  {
    id: "avisos",
    title: "Notificações, e-mail e Telegram",
    icon: "notices",
    summary: "Como receber os alarmes no celular, por e-mail ou pelo Telegram.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Push** (celular e computador): ative em **Minha conta › Notificações**, em cada aparelho.",
          "**E-mail**: em **Minha conta › Avisos**, ligue “Alarmes por e-mail” e, se quiser, o **Resumo do mês** (enviado no dia 1).",
          "**Telegram**: em **Minha conta › Avisos**, clique em **Conectar Telegram** e toque em **Iniciar** na conversa com o bot. Para parar, envie /sair ao bot ou clique em Desconectar.",
        ],
      },
    ],
  },
  {
    id: "tv",
    title: "Tela de TV",
    icon: "tv",
    path: "@tv",
    summary: "Tela cheia para a sala de controle, com telas que alternam sozinhas.",
    blocks: [
      {
        kind: "p",
        text: "Abra **Tela de TV** no menu (de preferência na TV ou monitor da sala). As telas — Agora, Demanda, Alarmes e Consumo de hoje — alternam a cada 20 segundos e a tela do aparelho fica acesa.",
      },
      {
        kind: "list",
        items: [
          "Mexa o mouse para ver os controles: anterior, pausar, próxima, tela cheia e sair.",
          "Teclado: setas trocam de tela, espaço pausa, F põe em tela cheia.",
          "Para mudar o tempo de cada tela, acrescente ?tempo=30 (segundos) ao endereço.",
        ],
      },
    ],
  },
  {
    id: "usuarios",
    title: "Usuários e papéis",
    icon: "users",
    path: "/usuarios",
    summary: "Convidar pessoas, papéis e escalonamento (administrador do cliente).",
    blocks: [
      {
        kind: "list",
        items: [
          "**Visualizador**: vê painéis, consumo, fatura e alarmes.",
          "**Operador**: também reconhece alarmes e exporta planilhas.",
          "**Administrador**: também cria regras de alarme, define metas e gerencia usuários.",
        ],
      },
      {
        kind: "steps",
        items: [
          "Em **Usuários › Convidar**, informe nome, e-mail e papel.",
          "A pessoa recebe um e-mail com o link para definir a senha (vale 7 dias). Sem e-mail configurado, aparece o link para você mandar por WhatsApp.",
          "Em cada pessoa, ligue os avisos: alarmes por e-mail, resumo do mês e **escalonamento**.",
          "Em **Escalonamento de alarmes**, escolha o prazo: se ninguém reconhecer um alarme nesse tempo, quem está marcado recebe o aviso por push, e-mail e Telegram.",
        ],
      },
    ],
  },
  {
    id: "conta",
    title: "Minha conta",
    icon: "account",
    summary: "Senha, tema, notificações e avisos.",
    blocks: [
      {
        kind: "p",
        text: "Troque a senha (as outras sessões abertas são encerradas), escolha o tema e configure as notificações deste aparelho e os avisos por e-mail e Telegram.",
      },
    ],
  },
  {
    id: "agua",
    title: "Água",
    icon: "water",
    path: "/agua",
    module: "agua",
    summary: "Reservatório ao vivo, consumo por dia, bomba de recalque e aviso de possível vazamento.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Reservatório**: nível em %, volume em litros e a capacidade informada no Pulse Configurador da unidade. Abaixo de 20 % o contorno do desenho fica em atenção.",
          "**Consumo hoje**: quanto a unidade gastou desde a meia-noite, em m³. Com medidor de vazão de entrada, é medido (o que entrou menos o que o reservatório subiu); só com o nível, é calculado pela descida do reservatório e estimado enquanto a bomba enche.",
          "**Ritmo agora** e **Autonomia**: o consumo médio das últimas 3 horas e quantas horas o reservatório aguenta nesse ritmo se a reposição parar (falta d'água da rua, bomba parada).",
          "**Bomba de recalque** (quando o CLP tem o sinal): ligada ou desligada, horas ligada e partidas no dia, pressão de recalque.",
          "**Consumo por dia** (últimos 15 dias; o de hoje, mais claro, é parcial) e **Madrugada**: a hora mais calma entre 0h e 5h, dia a dia.",
          "**Tendência**: nível e, quando houver, vazão de entrada ou pressão, em 24 h, 7 ou 30 dias.",
        ],
      },
      {
        kind: "p",
        text: "**Possível vazamento**: com a unidade fechada, o consumo da madrugada deveria ser parecido todas as noites. Quando a hora mais calma passa do dobro do normal da própria unidade (e pelo menos 30 L/h a mais), aparece o aviso na tela e um alarme de Atenção, enviado pelos canais de cada pessoa. O normal é a mediana das últimas 14 noites; nos primeiros 7 dias o sistema ainda não julga.",
      },
      {
        kind: "tip",
        text: "Torre de resfriamento ou máquina de gelo gastam água a noite toda e não são vazamento: por isso a comparação é com a própria unidade, e não com um número fixo.",
      },
    ],
  },
  {
    id: "gerador",
    title: "Gerador",
    icon: "generator",
    path: "/gerador",
    module: "gerador",
    summary: "Se o grupo vai partir quando a rede cair, diesel e autonomia, bateria, partidas e falhas.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Situação**: Pronto para partir (em automático, sem falha, com diesel e bateria), Não está pronto, Em operação (com a potência fornecida), Em falha (com as falhas ligadas) ou Sem comunicação.",
          "**Diesel e autonomia**: litros no tanque e horas de operação que ainda dão, pelo consumo medido nas partidas (ou pelo informado no configurador).",
          "**Bateria**: tensão em repouso e quanto ela caiu no último arranque. Queda que aumenta de partida em partida denuncia bateria no fim da vida antes de ela falhar.",
          "**Última partida**: dias desde a última vez que o grupo rodou. Teste semanal é a prática recomendada: a partir de 7 dias fica em atenção.",
          "**Últimos 30 dias**: % do tempo pronto para partir, partidas e falhas, horas rodando, diesel gasto, energia gerada e a maior queda de bateria.",
          "**Partidas**: cada corrida com início, motivo (teste, queda de rede, partida manual, exercício), resultado, duração, diesel, energia e queda da bateria.",
        ],
      },
      {
        kind: "p",
        text: "Os números vêm do gateway da unidade, que lê o controlador do gerador: o Pulse mostra os mesmos valores da tela local. As falhas do gerador também chegam como alarmes do gateway.",
      },
    ],
  },
  {
    id: "configurar-modulos",
    title: "Configurar água e gerador",
    icon: "setup",
    adminOnly: true,
    summary: "Como o gateway da unidade liga os módulos no Pulse e o que ele precisa ter cadastrado.",
    blocks: [
      {
        kind: "p",
        text: "Quem liga os módulos é o **Pulse Configurador**, no gateway da unidade: ele informa ao Pulse quais módulos a unidade usa e as telas aparecem sozinhas. A administração só **desliga** um módulo de um cliente que não contratou (Administração › Clientes › Módulos).",
      },
      {
        kind: "steps",
        items: [
          "No configurador, use o módulo de envio **versão 3** (src/nuvem.js) e a seção **nuvem** com url e token da unidade.",
          "Opcional: declare os módulos em **nuvem.modulos**, por exemplo [\"energia\", \"agua\", \"gerador\"]. Sem essa chave, valem os que existem no configurador.",
          "**Reservatório**: cadastre o CLP com perfil do grupo agua (clp-reservatorio, só nível, ou clp-utilidades, com vazão, pressão e bomba) e, na seção **caixa_agua**, informe **medidor** (id do equipamento) e **capacidade_litros**.",
          "**Gerador**: cadastre o controlador com perfil do grupo gerador e, na seção **gerador**, informe **medidor**, **capacidade_tanque_litros**, **consumo_litros_hora** e **potencia_nominal_kw**.",
          "Reinicie o serviço e confira em **Administração › Unidades › (a unidade)**: os módulos declarados e os equipamentos recebidos aparecem no fim da página.",
        ],
      },
      {
        kind: "tip",
        text: "Sem capacidade_litros o Pulse mostra só o nível (sem volume, consumo, autonomia ou aviso de vazamento). O histórico de água e gerador sobe a partir do módulo versão 3; com a versão 2 aparece só a leitura ao vivo.",
      },
    ],
  },
  {
    id: "administracao",
    title: "Administração (Engemase)",
    icon: "admin",
    adminOnly: true,
    summary: "Clientes, unidades, token do gateway, tarifa e saúde do sistema.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Clientes**: nome, cores (principal e de destaque), logo, imagem de fundo do login próprio (/login/<cliente>), frase da tela de login e os **módulos** que o cliente pode usar (Água e Gerador ligam sozinhos pelo gateway da unidade; desligue o que não foi contratado).",
          "**Unidades**: nome, endereço, fuso, **área (m²)** para o ranking, **token do gateway** (aparece uma vez só, ao gerar) e a **tarifa** (modalidade, preços, demanda contratada, horário de ponta e impostos).",
          "**Medidores**: são criados pelo próprio gateway; aqui se ajustam nome, ordem e dados de cadastro.",
          "**Usuários**: contas da equipe e dos clientes, com acesso a um ou mais clientes.",
          "**Saúde do sistema**: o que falta configurar (push, e-mail, Telegram, Redis, agendador), unidades sem envio e erros recentes.",
        ],
      },
      {
        kind: "tip",
        text: "Ao instalar uma unidade nova: crie a unidade, gere o token, coloque no config.json do gateway e confira em Saúde do sistema se a unidade aparece como “Enviando”.",
      },
    ],
  },
];

export const FAQ: FaqItem[] = [
  {
    id: "tema-automatico",
    question: "O tema Automático não acompanha o Windows (fica escuro com o Windows claro).",
    section: "conta",
    answer: [
      "O Automático segue o que o **navegador** informa, e o Chrome e o Edge têm uma configuração própria que passa por cima do Windows. O menu de tema mostra em que modo o navegador está.",
      "Chrome: ⋮ › Configurações › Aparência › Modo: **Dispositivo**. Edge: ⋯ › Configurações › Aparência › Aparência geral: **Padrão do sistema**. Confira também se não há uma opção de “modo escuro forçado” para sites ligada.",
      "No aplicativo instalado, feche e abra de novo depois de mudar. Se preferir não depender do navegador, escolha **Claro** ou **Escuro** no menu de tema.",
    ],
  },
  {
    id: "push-nao-chega",
    question: "Não recebo as notificações no celular.",
    section: "avisos",
    answer: [
      "Ative em **Minha conta › Notificações** em cada aparelho e use o botão de teste.",
      "No **iPhone**, as notificações só funcionam com o sistema instalado na Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início) e aberto pelo ícone.",
      "Se o navegador bloqueou, libere nas configurações do site (cadeado na barra de endereço › Notificações). Como alternativa, ative os avisos por e-mail ou Telegram.",
    ],
  },
  {
    id: "sem-comunicacao",
    question: "O que significa “Sem comunicação”?",
    section: "visao-geral",
    answer: [
      "O medidor (ou a unidade inteira) parou de enviar leituras. O valor mostrado é o último recebido. Quando é a unidade toda, normalmente é a internet ou o computador do gateway; quando é um medidor só, costuma ser o cabo RS-485 ou o próprio medidor.",
      "Se a unidade ficar 10 minutos sem enviar, abre o alarme **Unidade sem comunicação**. Ele fecha sozinho quando o envio volta, e o histórico desse intervalo é completado pelo gateway.",
    ],
  },
  {
    id: "fatura-diferente",
    question: "Por que a fatura estimada é diferente da conta da distribuidora?",
    section: "fatura",
    answer: [
      "A estimativa usa o mês do calendário; a distribuidora usa o ciclo de leitura (outras datas). A conta também tem itens que o sistema não calcula, como iluminação pública, créditos, multas e juros.",
      "Confira se a tarifa cadastrada (preços, bandeira, impostos e demanda contratada) está igual à da última conta.",
    ],
  },
  {
    id: "demanda",
    question: "O que é demanda contratada e ultrapassagem?",
    section: "fatura",
    answer: [
      "No Grupo A, a distribuidora mede a média da potência em janelas de 15 minutos; a maior do mês é a **demanda medida**. Você paga a maior entre a medida e a **contratada**.",
      "Se a medida passar da contratada em mais de 5 %, o excesso é cobrado em dobro (**ultrapassagem**). O aviso “Demanda vai passar da contratada” chega no meio da janela, a tempo de desligar alguma carga.",
    ],
  },
  {
    id: "nao-medido",
    question: "O que é o “Não medido”?",
    section: "consumo",
    answer: [
      "É a entrada geral menos a soma dos setores com medidor: cargas sem medidor próprio, perdas nos cabos e pequenas diferenças de medição. Um não medido grande indica circuitos que valeria a pena medir.",
    ],
  },
  {
    id: "fator-potencia",
    question: "O que é fator de potência e por que 0,92?",
    section: "fatura",
    answer: [
      "Mostra quanto da energia que circula vira trabalho útil. Motores e compressores puxam energia reativa e baixam o fator. Abaixo de **0,92**, consumidores do Grupo A pagam o excedente de reativo.",
      "A correção normalmente é feita com banco de capacitores; o cartão “Fator de potência e capacitores”, na Fatura, sugere o tamanho e a economia.",
    ],
  },
  {
    id: "consumo-fora",
    question: "O que é o alarme “Consumo acima (ou abaixo) do normal”?",
    section: "alarmes",
    answer: [
      "Cada hora é comparada com a mesma hora do mesmo dia da semana nas 4 semanas anteriores. Se duas horas seguidas saem bem da faixa normal, abre o alarme.",
      "**Acima** costuma ser equipamento esquecido ligado ou com defeito; **abaixo**, equipamento parado (câmara fria, compressor, ar-condicionado). Feriados e mudanças de horário da unidade também podem disparar.",
    ],
  },
  {
    id: "exportar",
    question: "Como levo os dados para o Excel?",
    section: "consumo",
    answer: [
      "No detalhe do medidor, o botão **CSV** do histórico baixa o período exibido. Na tela Consumo (visão do mês), o botão de planilha baixa o consumo por setor. Os arquivos já vêm com vírgula decimal e abrem direto no Excel.",
    ],
  },
  {
    id: "pdf",
    question: "Como gero o relatório em PDF?",
    section: "fatura",
    answer: [
      "Na tela Fatura, clique em **Relatório do mês** e depois em Imprimir; no destino da impressão, escolha **Salvar como PDF**.",
      "Os relatórios de demanda, gerador, água e o comparativo entre unidades ficam nas abas do topo da mesma página, e também nos botões das telas Fatura, Gerador, Água e Ranking.",
    ],
  },
  {
    id: "senha",
    question: "Esqueci a senha.",
    section: "conta",
    answer: [
      "Na tela de login, clique em **Esqueci minha senha** e siga o link enviado por e-mail (vale 1 hora). Se o e-mail não chegar, peça ao administrador da sua empresa um link de nova senha (Usuários › Link de nova senha).",
    ],
  },
  {
    id: "convidar",
    question: "Como dou acesso para outra pessoa?",
    section: "usuarios",
    answer: [
      "Se você é administrador do cliente: **Usuários › Convidar**, com nome, e-mail e papel. Se não é, peça ao administrador da sua empresa.",
    ],
  },
  {
    id: "telegram",
    question: "Como recebo os alarmes pelo Telegram?",
    section: "avisos",
    answer: [
      "Em **Minha conta › Avisos**, clique em **Conectar Telegram**. O Telegram abre a conversa com o bot do sistema: toque em **Iniciar**. Em segundos a tela mostra “Conectado”.",
      "Se aparecer “O Telegram ainda não foi configurado no servidor”, peça à Engemase para ativar.",
    ],
  },
  {
    id: "atualizacao",
    question: "De quanto em quanto tempo os dados atualizam?",
    section: "visao-geral",
    answer: [
      "As leituras ao vivo atualizam a cada 10 segundos. O histórico guarda médias de 5 minutos (por 400 dias) e o consumo por hora (sempre). O consumo de uma hora aparece alguns minutos depois que ela fecha.",
    ],
  },
  {
    id: "simulador-precos",
    question: "Por que o simulador pede preços?",
    section: "fatura",
    answer: [
      "O sistema conhece só a tarifa cadastrada da unidade. Para comparar com outra modalidade (por exemplo, azul quando o contrato é verde), digite os preços dela, que estão na tabela de tarifas da sua distribuidora ou no site da ANEEL.",
    ],
  },
  {
    id: "tv-apaga",
    question: "A tela de TV apaga ou pede login de novo.",
    section: "tv",
    answer: [
      "A tela pede ao aparelho para ficar acesa, mas algumas TVs e navegadores ignoram: desligue a economia de energia da TV. O login vale alguns dias; depois disso, entre de novo no navegador da TV.",
    ],
  },
  {
    id: "celular",
    question: "Funciona no celular?",
    section: "primeiros-passos",
    answer: [
      "Sim: todas as telas se ajustam ao celular, e dá para instalar como aplicativo (veja Primeiros passos).",
    ],
  },
  {
    id: "modulo-nao-aparece",
    question: "Por que não aparece Água ou Gerador no menu?",
    answer: [
      "Os módulos aparecem quando o gateway da unidade os declara (ou envia o reservatório ou o gerador) e o módulo faz parte do contrato do cliente. Se a sua unidade tem reservatório ou gerador e eles não aparecem, fale com a Engemase.",
    ],
  },
  {
    id: "agua-consumo",
    question: "Como o consumo de água é calculado?",
    section: "agua",
    module: "agua",
    answer: [
      "Pelo reservatório. Com medidor de vazão de entrada: o que entrou menos o quanto o reservatório subiu (medido). Só com o sensor de nível: o quanto o reservatório desceu; enquanto a bomba enche, o consumo é estimado pelo ritmo das descidas anteriores — o gráfico mostra quanto do dia foi estimado.",
    ],
  },
  {
    id: "agua-vazamento",
    question: "O que é o aviso de possível vazamento?",
    section: "agua",
    module: "agua",
    answer: [
      "Com a unidade fechada, a hora mais calma da madrugada (0h–5h) deveria gastar parecido todas as noites. Quando ela passa do dobro do normal da própria unidade e de 30 L/h a mais, o sistema avisa. Confira descargas, boias, torneiras e o próprio reservatório. O alarme fecha sozinho quando a madrugada volta ao normal.",
    ],
  },
  {
    id: "gerador-nao-pronto",
    question: "Por que o gerador aparece como “Não está pronto”?",
    section: "gerador",
    module: "gerador",
    answer: [
      "O gateway da unidade considera o grupo pronto só com todas as condições: em automático, sem falha, com diesel acima da reserva e bateria acima do mínimo. Basta uma faltar — o mais comum é o controlador ter ficado em manual depois de uma manutenção.",
    ],
  },
  {
    id: "unidade-nova",
    question: "Como coloco uma unidade nova no sistema?",
    section: "administracao",
    adminOnly: true,
    answer: [
      "Administração › Unidades › Nova unidade; gere o token do gateway e cole no config.json do gateway da unidade (trecho “nuvem”). Os medidores aparecem sozinhos no primeiro envio. Cadastre a tarifa e a área da unidade.",
    ],
  },
];
