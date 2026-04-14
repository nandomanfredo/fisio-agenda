// ============================================================
// calendario.gs — Integração com Google Calendar
// ============================================================
// Cria e remove eventos no Google Calendar quando agendamentos
// são confirmados ou cancelados.
//
// AUTORIZAÇÃO NECESSÁRIA:
// Na primeira execução, o Google pedirá permissão para acessar
// o Calendar. Execute a função testarCalendar() manualmente
// no editor do Apps Script para conceder a permissão.
// ============================================================


// ─── criarEventoCalendar: Cria um evento no Google Calendar ───
// Chamado por agenda.gs quando um agendamento é confirmado.
// Retorna o ID do evento criado (para salvar na planilha).
function criarEventoCalendar(agendamento) {
  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID);

    // Monta a data e hora de início do evento
    // agendamento.data está em formato 'YYYY-MM-DD'
    // agendamento.horario está em formato 'HH:MM'
    var parteData   = agendamento.data.split('-');    // ['2025', '06', '15']
    var parteHora   = agendamento.horario.split(':'); // ['09', '30']
    var duracao     = parseInt(agendamento.duracao) || 60; // duração em minutos

    var inicio = new Date(
      parseInt(parteData[0]),   // ano
      parseInt(parteData[1]) - 1, // mês (0-indexado)
      parseInt(parteData[2]),   // dia
      parseInt(parteHora[0]),   // hora
      parseInt(parteHora[1])    // minuto
    );

    // Calcula o horário de término somando a duração em minutos
    var fim = new Date(inicio.getTime() + duracao * 60 * 1000);

    // Título do evento
    var titulo = agendamento.clienteNome + ' — ' + (agendamento.tipoAtendimento || 'Fisioterapia');

    // Descrição do evento com informações úteis
    var descricao = [
      'Paciente: ' + agendamento.clienteNome,
      'Tipo: ' + (agendamento.tipoAtendimento || ''),
      'Valor: R$ ' + (parseFloat(agendamento.valor) || 0).toFixed(2),
      'Pagamento: ' + (agendamento.formaPagamento || ''),
      agendamento.observacoes ? 'Obs: ' + agendamento.observacoes : ''
    ].filter(Boolean).join('\n');

    // Cria o evento no Google Calendar
    var evento = calendar.createEvent(titulo, inicio, fim, {
      description: descricao
    });

    Logger.log('Evento criado no Calendar: ' + evento.getId() + ' para ' + agendamento.clienteNome);
    return evento.getId();

  } catch (err) {
    // Se falhar (ex: sem permissão), registra o erro mas não interrompe o fluxo
    Logger.log('Erro ao criar evento no Calendar: ' + err.message);
    return null;
  }
}


// ─── removerEventoCalendar: Remove um evento do Google Calendar pelo ID ───
// Chamado quando um agendamento é cancelado.
function removerEventoCalendar(eventoID) {
  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    var evento = calendar.getEventById(eventoID);

    if (evento) {
      evento.deleteEvent();
      Logger.log('Evento removido do Calendar: ' + eventoID);
      return true;
    } else {
      Logger.log('Evento não encontrado no Calendar: ' + eventoID);
      return false;
    }

  } catch (err) {
    Logger.log('Erro ao remover evento do Calendar: ' + err.message);
    return false;
  }
}


// ─── testarCalendar: Função de teste para verificar a integração ───
// Execute esta função manualmente no editor do Apps Script para:
// 1. Verificar se a integração está funcionando
// 2. Conceder as permissões de acesso ao Calendar
function testarCalendar() {
  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    Logger.log('Calendário encontrado: ' + calendar.getName());
    Logger.log('Integração com Google Calendar OK!');
  } catch (err) {
    Logger.log('Erro na integração com Google Calendar: ' + err.message);
  }
}
