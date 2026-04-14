// ============================================================
// whatsapp.gs — Integração Futura com WhatsApp
// ============================================================
//
// FASE 2 DO PROJETO — ainda não implementado.
//
// Quando integrado (via Twilio, Z-API ou Evolution API), este arquivo
// receberá mensagens de texto da fisioterapeuta e responderá com
// dados da planilha, consultando as funções de servicos.gs.
//
// ─── POR QUE A CAMADA DE SERVIÇOS FACILITA ESSA INTEGRAÇÃO? ───
//
// Todas as funções de consulta já existem em servicos.gs:
//   getAgendamentosHoje()     → lista pacientes do dia
//   getAgendamentosSemana()   → agenda da semana
//   getResumoMes(mes, ano)    → resumo financeiro mensal
//   getClientesPorNome(nome)  → busca pacientes
//   getTopCategoriasDespesa() → onde o dinheiro está indo
//
// Quando o WhatsApp enviar uma mensagem, basta interpretar o texto
// e chamar a função correta — SEM precisar reescrever a lógica.
//
// ─── EXEMPLOS DE PERGUNTAS QUE O SISTEMA DEVERÁ ENTENDER ───
//
//   "Quem tenho hoje?"          → chama getAgendamentosHoje()
//   "Minha agenda da semana"    → chama getAgendamentosSemana()
//   "Quanto ganhei esse mês?"   → chama getResumoMes()
//   "Resumo de maio"            → chama getResumoMes(5, 2025)
//   "Despesas de junho"         → chama getTopCategoriasDespesa(6, 2025)
//   "Buscar paciente Maria"     → chama getClientesPorNome('Maria')
//
// ─── FLUXO FUTURO (FASE 2) ───
//
// 1. A fisioterapeuta envia mensagem no WhatsApp
// 2. O provedor (Twilio/Z-API/Evolution) faz um POST para a URL do Web App
//    com body: { action: 'whatsappWebhook', from: 'numero', body: 'mensagem' }
// 3. handleRequest em Code.gs detecta action === 'whatsappWebhook'
// 4. Chama receberMensagemWhatsapp(dados)
// 5. interpretarMensagem() detecta a intenção (simples ou via Gemini AI)
// 6. Chama a função correta de servicos.gs
// 7. Formata a resposta em texto simples
// 8. enviarRespostaWhatsapp() manda de volta via API do provedor
//
// ─── OPÇÃO COM GEMINI API (interpretação inteligente) ───
//
// Em vez de usar palavras-chave fixas, pode-se enviar a mensagem
// para a Gemini API com um prompt como:
//
//   "Você é um assistente de uma fisioterapeuta. A mensagem dela é:
//    '{mensagem}'. Qual dessas ações devo executar?
//    [agendamentosHoje, agendamentosSemana, resumoMes, buscaCliente]
//    Responda apenas com o nome da ação e os parâmetros em JSON."
//
// Isso torna o sistema muito mais flexível e natural.
// ============================================================


// ─── receberMensagemWhatsapp: Ponto de entrada do webhook ───
// Esta função será chamada pelo handleRequest quando action === 'whatsappWebhook'.
// Por enquanto está apenas estruturada para a implementação futura.
function receberMensagemWhatsapp(dados) {
  // TODO: implementar na fase 2

  // Exemplo de como será:
  // var mensagem = dados.body;            // texto enviado pela fisioterapeuta
  // var remetente = dados.from;           // número de telefone dela
  // var resposta = interpretarMensagem(mensagem); // detecta a intenção
  // enviarRespostaWhatsapp(remetente, resposta);   // manda a resposta

  Logger.log('[WhatsApp] Mensagem recebida (não implementado): ' + JSON.stringify(dados));
  return { mensagem: 'Integração WhatsApp ainda não implementada.' };
}


// ─── interpretarMensagem: Detecta o que a fisioterapeuta quer saber ───
// Versão simples com palavras-chave. Pode evoluir para Gemini AI.
function interpretarMensagem(texto) {
  // TODO: implementar na fase 2
  var t = (texto || '').toLowerCase();

  if (t.includes('hoje') || t.includes('dia')) {
    var agendamentos = getAgendamentosHoje();
    return formatarAgendamentosTexto(agendamentos);
  }

  if (t.includes('semana')) {
    var semana = getAgendamentosSemana();
    return formatarAgendamentosTexto(semana);
  }

  if (t.includes('mês') || t.includes('mes') || t.includes('ganhei')) {
    var resumo = getResumoMes();
    return formatarResumoTexto(resumo);
  }

  return 'Não entendi. Tente: "agenda de hoje", "semana", ou "resumo do mês".';
}


// ─── formatarAgendamentosTexto: Formata lista de agendamentos para WhatsApp ───
function formatarAgendamentosTexto(agendamentos) {
  // TODO: implementar na fase 2
  if (!agendamentos || agendamentos.length === 0) {
    return 'Nenhum agendamento encontrado.';
  }
  var linhas = ['📅 *Agendamentos:*'];
  agendamentos.forEach(function(a) {
    linhas.push('• ' + a.horario + ' — ' + a.clienteNome + ' (' + a.tipoAtendimento + ')');
  });
  return linhas.join('\n');
}


// ─── formatarResumoTexto: Formata resumo financeiro para WhatsApp ───
function formatarResumoTexto(resumo) {
  // TODO: implementar na fase 2
  return [
    '💰 *Resumo do mês:*',
    'Receitas: R$ ' + resumo.receitaTotal.toFixed(2),
    'Despesas: R$ ' + resumo.despesaTotal.toFixed(2),
    'Saldo: R$ ' + resumo.saldo.toFixed(2),
    'Atendimentos: ' + resumo.totalAtendimentos
  ].join('\n');
}


// ─── enviarRespostaWhatsapp: Envia mensagem de volta via API ───
function enviarRespostaWhatsapp(para, mensagem) {
  // TODO: implementar na fase 2 com a API escolhida (Twilio, Z-API, etc.)
  Logger.log('[WhatsApp] Enviaria para ' + para + ': ' + mensagem);
}
