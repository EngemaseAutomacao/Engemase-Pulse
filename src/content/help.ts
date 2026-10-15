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
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string[];
  /** Seção do manual relacionada. */
  section?: string;
  adminOnly?: boolean;
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
        text: "O sistema mostra, ao vivo, as leituras dos multimedidores das suas lojas. Quem envia os dados é o **Painel local**, o computador instalado em cada loja: ele lê os medidores e manda para a nuvem a cada poucos segundos.",
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
        text: "Estados de cada medidor: **Online** (leitura recente), **Sem comunicação** (o medidor ou a loja parou de enviar; o valor mostrado é o último recebido) e **Sem leituras** (nunca enviou). A tela atualiza sozinha a cada 10 segundos.",
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
    id: "lojas",
    title: "Lojas (ranking)",
    icon: "stores",
    path: "/lojas",
    summary: "As unidades lado a lado: kWh/m², custo, variação, FP e demanda.",
    blocks: [
      {
        kind: "p",
        text: "Aparece para clientes com duas ou mais unidades. Escolha o indicador (kWh por m², consumo, custo, R$ por m², variação contra o mês anterior, fator de potência ou demanda sobre a contratada); a melhor loja vem primeiro. Para kWh/m², a área de cada loja precisa estar cadastrada (peça à Engemase).",
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
          "**Do Painel da loja**: os alarmes configurados no Painel local chegam aqui e fecham sozinhos; reconhecer aqui reconhece lá também.",
          "**Regras da nuvem**: limite de uma grandeza (ex.: corrente acima de X) ou medidor sem enviar há N minutos. O administrador cria em Alarmes › Regras.",
          "**Automáticos**: loja sem comunicação (10 min sem envio), demanda vai passar da contratada (aviso no meio da janela de 15 min), demanda acima da contratada no mês, consumo fora do padrão e projeção acima da meta.",
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
    summary: "Painel para sala de controle, com telas que alternam sozinhas.",
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
    id: "administracao",
    title: "Administração (Engemase)",
    icon: "admin",
    adminOnly: true,
    summary: "Clientes, unidades, token do Painel, tarifa e saúde do sistema.",
    blocks: [
      {
        kind: "list",
        items: [
          "**Clientes**: nome, cores (principal e de destaque), logo, imagem de fundo do login próprio (/login/<cliente>) e frase da tela de login.",
          "**Unidades**: nome, endereço, fuso, **área (m²)** para o ranking, **token do Painel local** (aparece uma vez só, ao gerar) e a **tarifa** (modalidade, preços, demanda contratada, horário de ponta e impostos).",
          "**Medidores**: são criados pelo próprio Painel; aqui se ajustam nome, ordem e dados de cadastro.",
          "**Usuários**: contas da equipe e dos clientes, com acesso a um ou mais clientes.",
          "**Saúde do sistema**: o que falta configurar (push, e-mail, Telegram, Redis, agendador), lojas sem envio e erros recentes.",
        ],
      },
      {
        kind: "tip",
        text: "Ao instalar uma loja nova: crie a unidade, gere o token, coloque no config.json do Painel local e confira em Saúde do sistema se a loja aparece como “Enviando”.",
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
      "O medidor (ou a loja inteira) parou de enviar leituras. O valor mostrado é o último recebido. Quando é a loja toda, normalmente é a internet ou o computador do Painel local; quando é um medidor só, costuma ser o cabo RS-485 ou o próprio medidor.",
      "Se a loja ficar 10 minutos sem enviar, abre o alarme **Loja sem comunicação**. Ele fecha sozinho quando o envio volta, e o histórico desse intervalo é completado pelo Painel.",
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
      "**Acima** costuma ser equipamento esquecido ligado ou com defeito; **abaixo**, equipamento parado (câmara fria, compressor, ar-condicionado). Feriados e mudanças de horário da loja também podem disparar.",
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
    id: "loja-nova",
    question: "Como coloco uma loja nova no sistema?",
    section: "administracao",
    adminOnly: true,
    answer: [
      "Administração › Unidades › Nova unidade; gere o token do Painel e cole no config.json do Painel local da loja (trecho “nuvem”). Os medidores aparecem sozinhos no primeiro envio. Cadastre a tarifa e a área da loja.",
    ],
  },
];
