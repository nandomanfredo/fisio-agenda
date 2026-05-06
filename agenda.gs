// ============================================================
// agenda.gs — Módulo de Agendamentos
// ============================================================
// Gerencia os agendamentos de sessões de fisioterapia.
// Quando um agendamento é salvo com valor, lança automaticamente
// uma receita no módulo Financeiro.
// A integração com o Google Calendar é feita via calendario.gs.
// ============================================================


// ─── getAgendamentos: Retorna agendamentos com filtros opcionais ───
// O frontend pode passar: data (YYYY-MM-DD), semana: true, ou nada (hoje)
function getAgendamentos(filtros) {
  filtros = filtros || {};

  // Prioridade: se passou uma data específica, usa ela
  if (filtros.data) {
    var dataFiltro = normalizarDataISO(filtros.data);
    if (!dataFiltro) return [];
    return getAgendamentosPorData(dataFiltro);
  }

  // Se pediu a semana, usa a função de serviço
  if (filtros.semana) {
    return getAgendamentosSemana();
  }

  // Padrão: retorna os agendamentos de hoje
  return getAgendamentosHoje();
}


// ─── saveAgendamento: Salva um novo agendamento ou atualiza um existente ───
// Fluxo:
//   1. Salva os dados na aba "Agendamentos"
//   2. Se tiver valor → lança receita automática no Financeiro
//   3. Se status = 'confirmado' → cria evento no Google Calendar
function saveAgendamento(dados) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Agendamentos');
  var dataNormalizada = normalizarDataISO(dados.data);
  var horarioNormalizado = horarioParaString(dados.horario);

  if (!dados.clienteID) return { erro: 'Cliente não informado.' };
  if (!dataNormalizada) return { erro: 'Data inválida.' };
  if (!horarioNormalizado) return { erro: 'Horário inválido.' };

  if (dados.id) {
    // ── Atualização de agendamento existente ──
    var todasLinhas = sheet.getDataRange().getValues();
    for (var i = 1; i < todasLinhas.length; i++) {
      if (todasLinhas[i][0] == dados.id) {
        var eventoIDAnterior = todasLinhas[i][11]; // ID do evento no Calendar

        // Atualiza os dados na planilha
        sheet.getRange(i + 1, 1, 1, 13).setValues([[
          dados.id,
          dados.clienteID || '',
          dados.clienteNome || '',
          dataNormalizada,
          horarioNormalizado,
          dados.duracao || '',
          dados.tipoAtendimento || '',
          dados.valor || 0,
          dados.formaPagamento || '',
          dados.status || 'agendado',
          dados.observacoes || '',
          eventoIDAnterior, // mantém o ID do Calendar por enquanto
          todasLinhas[i][12] // mantém data de criação
        ]]);

        invalidarCache();
        return { sucesso: true, mensagem: 'Agendamento atualizado!', id: dados.id };
      }
    }
    return { erro: 'Agendamento não encontrado.' };

  } else {
    // ── Criação de novo agendamento ──
    var novoID = gerarID();
    var dataCriacao = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');

    // Insere a nova linha na planilha
    sheet.appendRow([
      novoID,
      dados.clienteID || '',
      dados.clienteNome || '',
      dataNormalizada,
      horarioNormalizado,
      dados.duracao || 60,
      dados.tipoAtendimento || '',
      dados.valor || 0,
      dados.formaPagamento || '',
      dados.status || 'agendado',
      dados.observacoes || '',
      '', // eventoCalendarID — preenchido depois
      dataCriacao
    ]);

    // ── Criação automática de evento no Google Calendar ──
    // CORRIGIDO: antes, o evento só era criado ao alterar o status para 'confirmado'.
    // Agora, se o agendamento já for criado como 'confirmado', o evento é criado imediatamente.
    if (dados.status === 'confirmado') {
      var agendamentoParaCalendario = {
        id:              novoID,
        clienteNome:     dados.clienteNome || '',
        data:            dataNormalizada,
        horario:         horarioNormalizado,
        duracao:         dados.duracao || 60,
        tipoAtendimento: dados.tipoAtendimento || '',
        valor:           dados.valor || 0,
        formaPagamento:  dados.formaPagamento || '',
        observacoes:     dados.observacoes || ''
      };
      var eventoID = criarEventoCalendar(agendamentoParaCalendario);
      if (eventoID) {
        // Atualiza a última linha com o ID do evento criado
        var ultimaLinha = sheet.getLastRow();
        sheet.getRange(ultimaLinha, 12).setValue(eventoID);
      }
    }

    invalidarCache();
    return { sucesso: true, mensagem: 'Agendamento criado!', id: novoID };
  }
}


// ─── updateStatusAgendamento: Atualiza apenas o status de um agendamento ───
// Quando o status muda para 'confirmado' → cria evento no Calendar
// Quando o status muda para 'cancelado' → remove evento do Calendar
// Quando o status muda para 'realizado' → lança receita (se ainda não lançou)
function updateStatusAgendamento(dados) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Agendamentos');
  var todasLinhas = sheet.getDataRange().getValues();

  for (var i = 1; i < todasLinhas.length; i++) {
    var linha = todasLinhas[i];
    if (linha[0] == dados.id) {
      var statusAnterior = linha[9];
      var novoStatus = dados.status;
      var eventoID = linha[11];

      // ── Atualiza o status na planilha ──
      sheet.getRange(i + 1, 10).setValue(novoStatus);

      // ── Integração com Google Calendar ──
      if (novoStatus === 'confirmado' && !eventoID) {
        // Cria evento no Calendar ao confirmar
        var agendamento = linhaParaAgendamento(linha);
        agendamento.status = novoStatus;
        var novoEventoID = criarEventoCalendar(agendamento);
        if (novoEventoID) {
          sheet.getRange(i + 1, 12).setValue(novoEventoID);
        }
      }

      if (novoStatus === 'cancelado' && eventoID) {
        // Remove evento do Calendar ao cancelar
        removerEventoCalendar(eventoID);
        sheet.getRange(i + 1, 12).setValue(''); // limpa o ID do evento
      }

      invalidarCache();
      return { sucesso: true, mensagem: 'Status atualizado para: ' + novoStatus };
    }
  }

  return { erro: 'Agendamento não encontrado.' };
}


// ─── deleteAgendamento: Remove um agendamento ───
// Também remove o evento correspondente no Google Calendar, se houver.
function deleteAgendamento(id) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Agendamentos');
  var dados = sheet.getDataRange().getValues();

  for (var i = dados.length - 1; i >= 1; i--) {
    if (dados[i][0] == id) {
      // Remove o evento do Calendar antes de apagar da planilha
      var eventoID = dados[i][11];
      if (eventoID) {
        removerEventoCalendar(eventoID);
      }
      sheet.deleteRow(i + 1);
      invalidarCache();
      return { sucesso: true, mensagem: 'Agendamento removido!' };
    }
  }

  return { erro: 'Agendamento não encontrado.' };
}


// ─── registrarPagamento: Registra o pagamento de um agendamento realizado ───
// Chamado pelo frontend quando a fisioterapeuta clica em "💰 Registrar pagamento".
// Cria a receita no Financeiro com a data e forma de pagamento informadas.
function registrarPagamento(dados) {
  if (!dados.agendamentoID) return { erro: 'ID do agendamento não informado.' };
  if (!dados.valor)         return { erro: 'Informe o valor.' };
  if (!dados.data)          return { erro: 'Informe a data do pagamento.' };
  var valorNumerico = parseFloat(dados.valor);
  if (isNaN(valorNumerico) || valorNumerico <= 0) return { erro: 'Valor inválido.' };
  var dataPagamento = normalizarDataISO(dados.data);
  if (!dataPagamento) return { erro: 'Data de pagamento inválida.' };

  // Evita duplicação: verifica se já existe receita para este agendamento
  if (verificarLancamentoExistente(dados.agendamentoID)) {
    return { erro: 'Pagamento já registrado para este agendamento.' };
  }

  // Busca dados do agendamento para montar a descrição
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Agendamentos');
  var linhas = sheet.getDataRange().getValues();
  var agendamento = null;
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(dados.agendamentoID)) {
      agendamento = linhaParaAgendamento(linhas[i]);
      break;
    }
  }
  if (!agendamento) return { erro: 'Agendamento não encontrado.' };

  // Cria a receita vinculada ao agendamento
  var sheetFin = ss.getSheetByName('Financeiro');
  var novoID = gerarID() + '_pag';
  var dataCriacao = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');
  var descricao = 'Atendimento - ' + agendamento.clienteNome +
    (agendamento.tipoAtendimento ? ' - ' + agendamento.tipoAtendimento : '');

  sheetFin.appendRow([
    novoID,
    'receita',
    valorNumerico,
    dataPagamento,
    descricao,
    dados.formaPagamento || '',
    'Atendimento',
    dados.agendamentoID,
    dataCriacao
  ]);

  invalidarCache();
  return { sucesso: true, mensagem: 'Pagamento registrado com sucesso!' };
}


// ─── lancarReceitaAtendimento: Cria receita automática no Financeiro ───
// Chamado internamente quando um agendamento tem valor definido.
// Assim a fisioterapeuta não precisa lançar manualmente cada atendimento.
function lancarReceitaAtendimento(agendamentoID, dados) {
  var ss = getSpreadsheet();
  var sheetFin = ss.getSheetByName('Financeiro');
  var novoID = gerarID() + '_auto'; // sufixo para identificar lançamentos automáticos
  var dataCriacao = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');

  sheetFin.appendRow([
    novoID,
    'receita',
    dados.valor || 0,
    dados.data || '',
    'Atendimento - ' + (dados.clienteNome || '') + ' - ' + (dados.tipoAtendimento || ''),
    dados.formaPagamento || '',
    'Atendimento', // categoria padrão para receitas de atendimento
    agendamentoID, // referência ao agendamento de origem
    dataCriacao
  ]);

  Logger.log('Receita lançada automaticamente para agendamento: ' + agendamentoID);
}


// ─── verificarLancamentoExistente: Verifica se já há lançamento para um agendamento ───
// Evita duplicação de receitas ao marcar o mesmo atendimento como realizado mais de uma vez.
function verificarLancamentoExistente(agendamentoID) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Financeiro');
  var dados = sheet.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) {
    if (dados[i][7] == agendamentoID) { // coluna AgendamentoID
      return true;
    }
  }
  return false;
}
