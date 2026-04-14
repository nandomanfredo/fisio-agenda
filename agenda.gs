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
    return getAgendamentosPorData(filtros.data);
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
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Agendamentos');

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
          dados.data || '',
          dados.horario || '',
          dados.duracao || '',
          dados.tipoAtendimento || '',
          dados.valor || 0,
          dados.formaPagamento || '',
          dados.status || 'agendado',
          dados.observacoes || '',
          eventoIDAnterior, // mantém o ID do Calendar por enquanto
          todasLinhas[i][12] // mantém data de criação
        ]]);

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
      dados.data || '',
      dados.horario || '',
      dados.duracao || 60,
      dados.tipoAtendimento || '',
      dados.valor || 0,
      dados.formaPagamento || '',
      dados.status || 'agendado',
      dados.observacoes || '',
      '', // eventoCalendarID — preenchido depois
      dataCriacao
    ]);

    // ── Lançamento automático de receita ──
    // Se o agendamento tiver um valor definido e status 'realizado',
    // lança automaticamente como receita no módulo financeiro.
    if (dados.valor && parseFloat(dados.valor) > 0 && dados.status === 'realizado') {
      lancarReceitaAtendimento(novoID, dados);
    }

    return { sucesso: true, mensagem: 'Agendamento criado!', id: novoID };
  }
}


// ─── updateStatusAgendamento: Atualiza apenas o status de um agendamento ───
// Quando o status muda para 'confirmado' → cria evento no Calendar
// Quando o status muda para 'cancelado' → remove evento do Calendar
// Quando o status muda para 'realizado' → lança receita (se ainda não lançou)
function updateStatusAgendamento(dados) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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

      // ── Lança receita ao marcar como realizado ──
      if (novoStatus === 'realizado' && statusAnterior !== 'realizado') {
        var agendamentoDados = linhaParaAgendamento(linha);
        if (agendamentoDados.valor && parseFloat(agendamentoDados.valor) > 0) {
          // Verifica se já existe lançamento para esse agendamento
          var jaLancado = verificarLancamentoExistente(linha[0]);
          if (!jaLancado) {
            lancarReceitaAtendimento(linha[0], agendamentoDados);
          }
        }
      }

      return { sucesso: true, mensagem: 'Status atualizado para: ' + novoStatus };
    }
  }

  return { erro: 'Agendamento não encontrado.' };
}


// ─── deleteAgendamento: Remove um agendamento ───
// Também remove o evento correspondente no Google Calendar, se houver.
function deleteAgendamento(id) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
      return { sucesso: true, mensagem: 'Agendamento removido!' };
    }
  }

  return { erro: 'Agendamento não encontrado.' };
}


// ─── lancarReceitaAtendimento: Cria receita automática no Financeiro ───
// Chamado internamente quando um agendamento tem valor definido.
// Assim a fisioterapeuta não precisa lançar manualmente cada atendimento.
function lancarReceitaAtendimento(agendamentoID, dados) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Financeiro');
  var dados = sheet.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) {
    if (dados[i][7] == agendamentoID) { // coluna AgendamentoID
      return true;
    }
  }
  return false;
}
