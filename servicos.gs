// ============================================================
// servicos.gs — Camada de Serviços (Lógica de Negócio)
// ============================================================
// DECISÃO ARQUITETURAL IMPORTANTE:
//
// Este arquivo contém funções PURAS de consulta e processamento de dados.
// Elas não dependem de como a chamada chegou (web, WhatsApp, agendador, etc.).
//
// BENEFÍCIO: No futuro, quando integrarmos o WhatsApp, um chatbot ou
// qualquer outro canal, basta chamar as funções deste arquivo.
// Não precisaremos reescrever a lógica — apenas criar o novo "canal".
//
// REGRA: Nunca coloque lógica de negócio diretamente no handleRequest.
//        Sempre crie uma função aqui e chame ela de lá.
// ============================================================


// ─── getResumoMes: Retorna resumo financeiro de um mês específico ───
// Parâmetros:
//   mes  → número do mês (1 a 12). Se omitido, usa o mês atual.
//   ano  → ano com 4 dígitos. Se omitido, usa o ano atual.
// Retorna objeto com: receitaTotal, despesaTotal, saldo, totalAtendimentos
function getResumoMes(mes, ano) {
  var agora = new Date();
  mes = mes ? parseInt(mes) : agora.getMonth() + 1; // getMonth() retorna 0-11
  ano = ano ? parseInt(ano) : agora.getFullYear();

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheetFin = ss.getSheetByName('Financeiro');
  var sheetAge = ss.getSheetByName('Agendamentos');

  // Lê todos os lançamentos financeiros
  var dadosFin = sheetFin.getDataRange().getValues();
  var receitaTotal = 0;
  var despesaTotal = 0;

  // Percorre cada linha (pula a linha 1 que é o cabeçalho)
  for (var i = 1; i < dadosFin.length; i++) {
    var linha = dadosFin[i];
    var dataLancamento = new Date(linha[3]); // coluna Data
    var mesDado  = dataLancamento.getMonth() + 1;
    var anoDado  = dataLancamento.getFullYear();

    // Só soma os lançamentos do mês/ano solicitado
    if (mesDado === mes && anoDado === ano) {
      var tipo  = linha[1]; // coluna Tipo
      var valor = parseFloat(linha[2]) || 0; // coluna Valor
      if (tipo === 'receita') receitaTotal += valor;
      if (tipo === 'despesa') despesaTotal += valor;
    }
  }

  // Conta os atendimentos realizados no mês
  var dadosAge = sheetAge.getDataRange().getValues();
  var totalAtendimentos = 0;
  for (var j = 1; j < dadosAge.length; j++) {
    var linhaAge = dadosAge[j];
    var dataAge  = new Date(linhaAge[3]); // coluna Data
    var statusAge = linhaAge[9]; // coluna Status
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
function getGraficoMeses(quantidadeMeses) {
  quantidadeMeses = parseInt(quantidadeMeses) || 6;
  var resultado = [];
  var agora = new Date();

  // Itera pelos últimos N meses
  for (var i = quantidadeMeses - 1; i >= 0; i--) {
    var data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    var mes  = data.getMonth() + 1;
    var ano  = data.getFullYear();
    var resumo = getResumoMes(mes, ano);
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
function getTopCategoriasDespesa(mes, ano) {
  var agora = new Date();
  mes = mes ? parseInt(mes) : agora.getMonth() + 1;
  ano = ano ? parseInt(ano) : agora.getFullYear();

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Financeiro');
  var dados = sheet.getDataRange().getValues();

  // Acumula totais por categoria
  var categorias = {};
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var dataL = new Date(linha[3]);
    if (dataL.getMonth() + 1 === mes && dataL.getFullYear() === ano && linha[1] === 'despesa') {
      var cat = linha[6] || 'Outros'; // coluna Categoria
      categorias[cat] = (categorias[cat] || 0) + (parseFloat(linha[2]) || 0);
    }
  }

  // Converte para array e ordena do maior para o menor
  var lista = Object.keys(categorias).map(function(cat) {
    return { categoria: cat, total: categorias[cat] };
  });
  lista.sort(function(a, b) { return b.total - a.total; });

  return lista;
}


// ─── getAgendamentosHoje: Lista os agendamentos do dia atual ───
// CORRIGIDO: usa Utilities.formatDate com fuso de Brasília para evitar
// que o servidor (que roda em UTC) calcule "hoje" como o dia errado.
function getAgendamentosHoje() {
  var hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  return getAgendamentosPorData(hojeStr);
}


// ─── getAgendamentosSemana: Lista os agendamentos dos próximos 7 dias ───
// CORRIGIDO: compara apenas a DATA (não datetime) para evitar que agendamentos
// do dia atual sumam dependendo do horário em que a consulta é feita.
function getAgendamentosSemana() {
  // "Hoje" como string no fuso de Brasília
  var hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');

  // Calcula a data de 6 dias à frente
  var dataFim = new Date(hojeStr + 'T00:00:00');
  dataFim.setDate(dataFim.getDate() + 6);
  var fimStr = Utilities.formatDate(dataFim, 'America/Sao_Paulo', 'yyyy-MM-dd');

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Agendamentos');
  var dados = sheet.getDataRange().getValues();
  var resultado = [];

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    var dataAgStr = dataParaString(linha[3]); // converte Date object para string
    // Compara strings no formato 'YYYY-MM-DD' — funciona corretamente com >= e <=
    if (dataAgStr >= hojeStr && dataAgStr <= fimStr && linha[9] !== 'cancelado') {
      resultado.push(linhaParaAgendamento(linha));
    }
  }

  resultado.sort(function(a, b) {
    return (a.data + a.horario).localeCompare(b.data + b.horario);
  });

  return resultado;
}


// ─── getAgendamentosPorData: Lista agendamentos de uma data específica ───
// Parâmetro: dataStr no formato 'YYYY-MM-DD'
function getAgendamentosPorData(dataStr) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Agendamentos');
  var dados = sheet.getDataRange().getValues();
  var resultado = [];

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    // CORRIGIDO: converte a data da planilha antes de comparar com a string
    if (dataParaString(linha[3]) === dataStr && linha[9] !== 'cancelado') {
      resultado.push(linhaParaAgendamento(linha));
    }
  }

  resultado.sort(function(a, b) { return a.horario.localeCompare(b.horario); });
  return resultado;
}


// ─── getClientesPorNome: Busca clientes pelo nome (parcial) ───
// Útil para a busca no módulo de clientes e para o WhatsApp futuro.
function getClientesPorNome(nome) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Clientes');
  var dados = sheet.getDataRange().getValues();
  var resultado = [];
  var nomeBusca = (nome || '').toLowerCase();

  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    if (linha[0] === '') continue; // pula linhas vazias
    if (linha[1].toLowerCase().indexOf(nomeBusca) !== -1) {
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
    id:              linha[0],
    clienteID:       linha[1],
    clienteNome:     linha[2],
    data:            dataParaString(linha[3]), // CORRIGIDO: sempre retorna string 'YYYY-MM-DD'
    horario:         linha[4],
    duracao:         linha[5],
    tipoAtendimento: linha[6],
    valor:           linha[7],
    formaPagamento:  linha[8],
    status:          linha[9],
    observacoes:     linha[10],
    eventoCalendarID: linha[11]
  };
}

// Converte uma linha da aba Clientes em objeto JavaScript
function linhaParaCliente(linha) {
  return {
    id:             linha[0],
    nome:           linha[1],
    telefone:       linha[2],
    email:          linha[3],
    dataNascimento: linha[4],
    observacoes:    linha[5],
    dataCadastro:   linha[6]
  };
}

// Converte uma linha da aba Financeiro em objeto JavaScript
function linhaParaLancamento(linha) {
  return {
    id:             linha[0],
    tipo:           linha[1],
    valor:          linha[2],
    data:           linha[3],
    descricao:      linha[4],
    formaPagamento: linha[5],
    categoria:      linha[6],
    agendamentoID:  linha[7],
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

// ─── dataParaString: Converte qualquer valor de data da planilha para 'YYYY-MM-DD' ───
// PROBLEMA RAIZ: O Google Sheets armazena datas como objetos Date internamente.
// Quando lemos com getValues(), o valor pode ser um objeto Date em vez de string.
// Isso quebrava todas as comparações de data (linha[3] === '2026-04-15' sempre false).
// Esta função resolve isso de forma segura para qualquer tipo de entrada.
function dataParaString(valor) {
  if (!valor) return '';
  // Se já for um objeto Date do Google Apps Script
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  // Se for string, pega apenas os 10 primeiros caracteres (YYYY-MM-DD)
  return String(valor).substring(0, 10);
}
