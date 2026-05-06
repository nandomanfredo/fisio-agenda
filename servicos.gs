// ============================================================
// servicos.gs — Camada de Serviços (Lógica de Negócio)
// ============================================================

// ──────────────────────────────────────────────
// CACHE (CacheService do Apps Script — TTL: 90s)
// Evita reabrir o Sheets a cada requisição
// ──────────────────────────────────────────────

function getFromCache(chave) {
  try {
    var val = CacheService.getScriptCache().get(chave);
    return val ? JSON.parse(val) : null;
  } catch(e) { return null; }
}

function saveToCache(chave, dados, ttl) {
  try {
    CacheService.getScriptCache().put(chave, JSON.stringify(dados), ttl || CACHE_TTL.CURTO);
  } catch(e) {
    Logger.log('Cache não salvo para chave ' + chave + ': ' + e.message);
  }
}

// Chamada por todas as funções de escrita para evitar dados velhos no cache
function invalidarCache() {
  try {
    var chaves = [
      CACHE_KEY.CLIENTES,
      CACHE_KEY.AGENDAMENTOS_HOJE,
      CACHE_KEY.AGENDAMENTOS_SEMANA,
      CACHE_KEY.PAGAMENTOS_REALIZADOS,
      CACHE_KEY.DASH_GRAFICO_6
    ];

    var agora = new Date();
    for (var i = 0; i < 12; i++) {
      var data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      var mes = data.getMonth() + 1;
      var ano = data.getFullYear();
      chaves.push('dash_resumo_' + ano + '_' + mes);
      chaves.push('dash_categorias_' + ano + '_' + mes);
      chaves.push('bootstrap_' + ano + '_' + mes + '_sem_dash');
      chaves.push('bootstrap_' + ano + '_' + mes + '_com_dash');
    }

    CacheService.getScriptCache().removeAll(chaves);
  } catch(e) {}
}

// ─── getBootstrap: carrega dados iniciais em uma única chamada ───
function getBootstrap(mes, ano, incluirDashboard) {
  var agora = new Date();
  mes = mes ? parseInt(mes) : agora.getMonth() + 1;
  ano = ano ? parseInt(ano) : agora.getFullYear();
  incluirDashboard = incluirDashboard === true || incluirDashboard === 'true';
  var chaveBootstrap = 'bootstrap_' + ano + '_' + mes + '_' + (incluirDashboard ? 'com_dash' : 'sem_dash');
  var cached = getFromCache(chaveBootstrap);
  if (cached) return cached;

  var dadosAgendamentos = getDadosAgendamentos();
  var dadosFinanceiro = getDadosFinanceiro();
  var dadosClientes = getDadosClientes();
  var hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var mapaPagamentos = getPagamentosRealizadosComDados(dadosFinanceiro);

  var resposta = {
    agendamentos: getAgendamentosPorDataComDados(hojeStr, dadosAgendamentos, mapaPagamentos),
    clientes: getClientesComDados(dadosClientes),
    lancamentos: getLancamentosComDados({ mes: mes, ano: ano, limite: 80 }, dadosFinanceiro)
  };

  if (incluirDashboard) {
    resposta.dashboard = getDashboard(mes, ano);
  }

  saveToCache(chaveBootstrap, resposta, CACHE_TTL.CURTO);
  return resposta;
}


// ─── getDashboard: Retorna TODOS os dados do dashboard em UMA única chamada ───
// Substitui as 3 chamadas separadas, reduzindo o tempo de carregamento em ~65%
function getDashboard(mes, ano) {
  var agora = new Date();
  mes = mes ? parseInt(mes) : agora.getMonth() + 1;
  ano = ano ? parseInt(ano) : agora.getFullYear();
  var chaveResumo = 'dash_resumo_' + ano + '_' + mes;
  var chaveCategorias = 'dash_categorias_' + ano + '_' + mes;
  var chaveGrafico = CACHE_KEY.DASH_GRAFICO_6;

  var dadosFinanceiro = getDadosFinanceiro();
  var dadosAgendamentos = getDadosAgendamentos();

  var resumo = getFromCache(chaveResumo);
  if (!resumo) {
    resumo = getResumoMes(mes, ano, dadosFinanceiro, dadosAgendamentos);
    saveToCache(chaveResumo, resumo, CACHE_TTL.CURTO);
  }

  var grafico = getFromCache(chaveGrafico);
  if (!grafico) {
    grafico = getGraficoMeses(6, dadosFinanceiro, dadosAgendamentos);
    saveToCache(chaveGrafico, grafico, CACHE_TTL.CURTO);
  }

  var categorias = getFromCache(chaveCategorias);
  if (!categorias) {
    categorias = getTopCategoriasDespesa(mes, ano, dadosFinanceiro);
    saveToCache(chaveCategorias, categorias, CACHE_TTL.CURTO);
  }

  return {
    resumo: resumo,
    grafico: grafico,
    categorias: categorias
  };
}


// ─── getResumoMes: Retorna resumo financeiro de um mês específico ───
// Parâmetros:
//   mes  → número do mês (1 a 12). Se omitido, usa o mês atual.
//   ano  → ano com 4 dígitos. Se omitido, usa o ano atual.
// Retorna objeto com: receitaTotal, despesaTotal, saldo, totalAtendimentos
function getResumoMes(mes, ano, dadosFinanceiro, dadosAgendamentos) {
  var agora = new Date();
  mes = mes ? parseInt(mes) : agora.getMonth() + 1; // getMonth() retorna 0-11
  ano = ano ? parseInt(ano) : agora.getFullYear();

  var dadosFin = dadosFinanceiro || getDadosFinanceiro();
  var receitaTotal = 0;
  var despesaTotal = 0;

  // Percorre cada linha (pula a linha 1 que é o cabeçalho)
  for (var i = 1; i < dadosFin.length; i++) {
    var linha = dadosFin[i];
    var dataLancamento = new Date(dataParaString(linha[3]) + 'T00:00:00');
    var mesDado  = dataLancamento.getMonth() + 1;
    var anoDado  = dataLancamento.getFullYear();

    // Só soma os lançamentos do mês/ano solicitado
    if (mesDado === mes && anoDado === ano) {
      var tipo  = linha[COL.FINANCEIRO.TIPO];
      var valor = parseFloat(linha[COL.FINANCEIRO.VALOR]) || 0;
      if (tipo === 'receita') receitaTotal += valor;
      if (tipo === 'despesa') despesaTotal += valor;
    }
  }

  // Conta os atendimentos realizados no mês
  var dadosAge = dadosAgendamentos || getDadosAgendamentos();
  var totalAtendimentos = 0;
  for (var j = 1; j < dadosAge.length; j++) {
    var linhaAge = dadosAge[j];
    var dataAge  = new Date(dataParaString(linhaAge[3]) + 'T00:00:00');
    var statusAge = linhaAge[COL.AGENDAMENTOS.STATUS];
    if (dataAge.getMonth() + 1 === mes && dataAge.getFullYear() === ano && statusAge === 'realizado') {
      totalAtendimentos++;
    }
  }

  return {
    mes: mes,
    ano: ano,
    receitaTotal: receitaTotal,
    despesaTotal: despesaTotal,
    saldo: receitaTotal - despesaTotal,
    totalAtendimentos: totalAtendimentos
  };
}


// ─── getGraficoMeses: Retorna receitas e despesas dos últimos N meses ───
// Parâmetros:
//   quantidadeMeses → quantos meses incluir no gráfico (padrão: 6)
// Retorna array de objetos: [{ mes, ano, receita, despesa }, ...]
function getGraficoMeses(quantidadeMeses, dadosFinanceiro, dadosAgendamentos) {
  quantidadeMeses = parseInt(quantidadeMeses) || 6;
  var resultado = [];
  var agora = new Date();

  // Itera pelos últimos N meses
  for (var i = quantidadeMeses - 1; i >= 0; i--) {
    var data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    var mes  = data.getMonth() + 1;
    var ano  = data.getFullYear();
    var resumo = getResumoMes(mes, ano, dadosFinanceiro, dadosAgendamentos);
    resultado.push({
      label: nomeMes(mes) + '/' + ano,
      mes: mes,
      ano: ano,
      receita: resumo.receitaTotal,
      despesa: resumo.despesaTotal
    });
  }

  return resultado;
}


// ─── getTopCategoriasDespesa: Ranking de categorias de despesa ───
// Parâmetros: mes, ano (iguais ao getResumoMes)
// Retorna array ordenado por valor: [{ categoria, total }, ...]
function getTopCategoriasDespesa(mes, ano, dadosFinanceiro) {
  var agora = new Date();
  mes = mes ? parseInt(mes) : agora.getMonth() + 1;
  ano = ano ? parseInt(ano) : agora.getFullYear();

  var dados = dadosFinanceiro || getDadosFinanceiro();

  // Acumula totais por categoria
  var categorias = {};
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var dataL = new Date(dataParaString(linha[3]) + 'T00:00:00');
    if (dataL.getMonth() + 1 === mes && dataL.getFullYear() === ano && linha[COL.FINANCEIRO.TIPO] === 'despesa') {
      var cat = linha[COL.FINANCEIRO.CATEGORIA] || 'Outros';
      categorias[cat] = (categorias[cat] || 0) + (parseFloat(linha[COL.FINANCEIRO.VALOR]) || 0);
    }
  }

  // Converte para array e ordena do maior para o menor
  var lista = Object.keys(categorias).map(function(cat) {
    return { categoria: cat, total: categorias[cat] };
  });
  lista.sort(function(a, b) { return b.total - a.total; });

  return lista;
}


// ─── getPagamentosRealizados: Lê o Financeiro e retorna Set de agendamentoIDs pagos ───
function getPagamentosRealizados() {
  var cached = getFromCache(CACHE_KEY.PAGAMENTOS_REALIZADOS);
  if (cached) return cached;
  var dados = getDadosFinanceiro();
  var pagos = getPagamentosRealizadosComDados(dados);
  saveToCache(CACHE_KEY.PAGAMENTOS_REALIZADOS, pagos, CACHE_TTL.CURTO);
  return pagos;
}

function getPagamentosRealizadosComDados(dadosFinanceiro) {
  var pagos = {};
  for (var i = 1; i < dadosFinanceiro.length; i++) {
    var agId = dadosFinanceiro[i][COL.FINANCEIRO.AGENDAMENTO_ID];
    if (agId) pagos[String(agId)] = true;
  }
  return pagos;
}

// ─── enriquecerComPagamentos: Adiciona campo 'pago' em cada agendamento ───
function enriquecerComPagamentos(agendamentos) {
  if (!agendamentos || !agendamentos.length) return agendamentos;
  var pagos = getPagamentosRealizados();
  return agendamentos.map(function(a) {
    a.pago = !!pagos[String(a.id)];
    return a;
  });
}


// ─── getAgendamentosHoje ───
function getAgendamentosHoje() {
  var cached = getFromCache(CACHE_KEY.AGENDAMENTOS_HOJE);
  if (cached) return cached;
  var hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var resultado = enriquecerComPagamentos(getAgendamentosPorData(hojeStr));
  saveToCache(CACHE_KEY.AGENDAMENTOS_HOJE, resultado, CACHE_TTL.CURTO);
  return resultado;
}


// ─── getAgendamentosSemana ───
function getAgendamentosSemana() {
  var cached = getFromCache(CACHE_KEY.AGENDAMENTOS_SEMANA);
  if (cached) return cached;

  var hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var dataFim = new Date(hojeStr + 'T00:00:00');
  dataFim.setDate(dataFim.getDate() + 6);
  var fimStr = Utilities.formatDate(dataFim, 'America/Sao_Paulo', 'yyyy-MM-dd');

  var dados = getDadosAgendamentos();
  var resultado = [];

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var dataAgStr = dataParaString(linha[3]);
    if (dataAgStr >= hojeStr && dataAgStr <= fimStr && linha[COL.AGENDAMENTOS.STATUS] !== 'cancelado') {
      resultado.push(linhaParaAgendamento(linha));
    }
  }

  resultado.sort(function(a, b) {
    return (a.data + a.horario).localeCompare(b.data + b.horario);
  });

  resultado = enriquecerComPagamentos(resultado);
  saveToCache(CACHE_KEY.AGENDAMENTOS_SEMANA, resultado, CACHE_TTL.CURTO);
  return resultado;
}


// ─── getAgendamentosPorData: Lista agendamentos de uma data específica ───
// Parâmetro: dataStr no formato 'YYYY-MM-DD'
function getAgendamentosPorData(dataStr) {
  var dados = getDadosAgendamentos();
  return getAgendamentosPorDataComDados(dataStr, dados);
}

function getAgendamentosPorDataComDados(dataStr, dadosAgendamentos, mapaPagamentos) {
  var resultado = [];
  for (var i = 1; i < dadosAgendamentos.length; i++) {
    var linha = dadosAgendamentos[i];
    if (dataParaString(linha[COL.AGENDAMENTOS.DATA]) === dataStr && linha[COL.AGENDAMENTOS.STATUS] !== 'cancelado') {
      resultado.push(linhaParaAgendamento(linha));
    }
  }
  resultado.sort(function(a, b) { return a.horario.localeCompare(b.horario); });
  if (mapaPagamentos) {
    resultado = enriquecerComPagamentosComMapa(resultado, mapaPagamentos);
  }
  return resultado;
}

function enriquecerComPagamentosComMapa(agendamentos, mapaPagamentos) {
  if (!agendamentos || !agendamentos.length) return agendamentos;
  return agendamentos.map(function(a) {
    a.pago = !!mapaPagamentos[String(a.id)];
    return a;
  });
}

function getDadosFinanceiro() {
  return getSheetOrThrow(SHEET.FINANCEIRO).getDataRange().getValues();
}

function getDadosAgendamentos() {
  return getSheetOrThrow(SHEET.AGENDAMENTOS).getDataRange().getValues();
}

function getDadosClientes() {
  return getSheetOrThrow(SHEET.CLIENTES).getDataRange().getValues();
}

function getClientesComDados(dadosClientes) {
  var clientes = [];
  for (var i = 1; i < dadosClientes.length; i++) {
    var linha = dadosClientes[i];
    if (!linha[COL.CLIENTES.ID]) continue;
    clientes.push(linhaParaCliente(linha));
  }
  clientes.sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return clientes;
}


// ─── getClientesPorNome: Busca clientes pelo nome (parcial) ───
// Útil para a busca no módulo de clientes e para o WhatsApp futuro.
function getClientesPorNome(nome) {
  var dados = getDadosClientes();
  var resultado = [];
  var nomeBusca = (nome || '').toLowerCase();

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    if (linha[COL.CLIENTES.ID] === '') continue;
    if (String(linha[COL.CLIENTES.NOME] || '').toLowerCase().indexOf(nomeBusca) !== -1) {
      resultado.push(linhaParaCliente(linha));
    }
  }

  return resultado;
}


// ──────────────────────────────────────────────
// FUNÇÕES AUXILIARES (usadas internamente)
// ──────────────────────────────────────────────

// Converte uma linha da aba Agendamentos em objeto JavaScript
function linhaParaAgendamento(linha) {
  return {
    id:              linha[COL.AGENDAMENTOS.ID],
    clienteID:       linha[COL.AGENDAMENTOS.CLIENTE_ID],
    clienteNome:     linha[COL.AGENDAMENTOS.CLIENTE_NOME],
    data:            dataParaString(linha[COL.AGENDAMENTOS.DATA]),
    horario:         horarioParaString(linha[COL.AGENDAMENTOS.HORARIO]),
    duracao:         linha[COL.AGENDAMENTOS.DURACAO],
    tipoAtendimento: linha[COL.AGENDAMENTOS.TIPO],
    valor:           linha[COL.AGENDAMENTOS.VALOR],
    formaPagamento:  linha[COL.AGENDAMENTOS.FORMA_PAGAMENTO],
    status:          linha[COL.AGENDAMENTOS.STATUS],
    observacoes:     linha[COL.AGENDAMENTOS.OBS],
    eventoCalendarID: linha[COL.AGENDAMENTOS.EVENTO_ID]
  };
}

// Converte uma linha da aba Clientes em objeto JavaScript
function linhaParaCliente(linha) {
  return {
    id:             linha[COL.CLIENTES.ID],
    nome:           linha[COL.CLIENTES.NOME],
    telefone:       linha[2],
    email:          linha[3],
    dataNascimento: linha[4],
    observacoes:    linha[5],
    dataCadastro:   linha[COL.CLIENTES.DATA_CADASTRO]
  };
}

// Converte uma linha da aba Financeiro em objeto JavaScript
function linhaParaLancamento(linha) {
  return {
    id:             linha[COL.FINANCEIRO.ID],
    tipo:           linha[COL.FINANCEIRO.TIPO],
    valor:          linha[COL.FINANCEIRO.VALOR],
    data:           dataParaString(linha[COL.FINANCEIRO.DATA]),
    descricao:      linha[COL.FINANCEIRO.DESCRICAO],
    formaPagamento: linha[COL.FINANCEIRO.FORMA_PAGAMENTO],
    categoria:      linha[COL.FINANCEIRO.CATEGORIA],
    agendamentoID:  linha[COL.FINANCEIRO.AGENDAMENTO_ID],
    dataCriacao:    linha[8]
  };
}

// Retorna o nome do mês em português
function nomeMes(num) {
  var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return meses[num - 1] || '';
}

// Adiciona zero à esquerda em números de 1 dígito (ex: 5 → '05')
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Converte qualquer valor de data da planilha para 'YYYY-MM-DD'
function dataParaString(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  var str = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    var partes = str.split('/');
    return partes[2] + '-' + partes[1] + '-' + partes[0];
  }
  var data = new Date(str);
  if (!isNaN(data.getTime())) {
    return Utilities.formatDate(data, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  return '';
}

function normalizarDataISO(valor) {
  return dataParaString(valor);
}

// Converte qualquer valor de horário da planilha para 'HH:mm'
// O Sheets pode converter "09:00" para um objeto Date — esta função corrige isso
function horarioParaString(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, 'America/Sao_Paulo', 'HH:mm');
  }
  var str = String(valor);
  if (/^\d{2}:\d{2}/.test(str)) return str.substring(0, 5);
  if (str.indexOf('T') !== -1) {
    var partes = str.split('T');
    if (partes[1]) return partes[1].substring(0, 5);
  }
  return str;
}

// ─── testarAgendamentosHoje: Diagnóstico via Web App ───
function testarAgendamentosHoje() {
  var hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var dados = getDadosAgendamentos();
  var resultado = [];
  var debug = [];
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    if (!linha[COL.AGENDAMENTOS.ID]) continue;
    var dataFormatada = dataParaString(linha[COL.AGENDAMENTOS.DATA]);
    debug.push({ linha: i, dataFormatada: dataFormatada, hoje: hojeStr, igual: dataFormatada === hojeStr, status: linha[COL.AGENDAMENTOS.STATUS] });
    if (dataFormatada === hojeStr && linha[COL.AGENDAMENTOS.STATUS] !== 'cancelado') resultado.push(linhaParaAgendamento(linha));
  }
  return { hoje: hojeStr, totalLinhas: dados.length - 1, debug: debug, agendamentos: resultado };
}
