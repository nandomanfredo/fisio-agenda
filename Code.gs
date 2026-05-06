// ============================================================
// Code.gs — Roteador Principal do Aplicativo
// ============================================================
// Este arquivo é o "portão de entrada" da aplicação.
// Toda requisição (GET ou POST) passa por aqui primeiro.
// O handleRequest lê a "ação" solicitada e chama a função certa.
// ============================================================

// ID da planilha Google Sheets onde os dados são salvos.
// Após criar sua planilha, cole o ID aqui (está na URL da planilha).
var SPREADSHEET_ID = '1FPfgr1m5xQ003ix7W9qeRPDZupT0p7Fui-reaBJHiNA';
var CALENDAR_ID = 'primary';

var SHEET = {
  CLIENTES: 'Clientes',
  AGENDAMENTOS: 'Agendamentos',
  FINANCEIRO: 'Financeiro'
};

var CACHE_TTL = {
  CURTO: 120,
  MEDIO: 300
};

var CACHE_KEY = {
  CLIENTES: 'clientes',
  AGENDAMENTOS_HOJE: 'agendamentos_hoje',
  AGENDAMENTOS_SEMANA: 'agendamentos_semana',
  PAGAMENTOS_REALIZADOS: 'pagamentos_realizados',
  DASH_GRAFICO_6: 'dash_grafico_6'
};

var COL = {
  CLIENTES: { ID: 0, NOME: 1, DATA_CADASTRO: 6 },
  AGENDAMENTOS: {
    ID: 0, CLIENTE_ID: 1, CLIENTE_NOME: 2, DATA: 3, HORARIO: 4, DURACAO: 5,
    TIPO: 6, VALOR: 7, FORMA_PAGAMENTO: 8, STATUS: 9, OBS: 10, EVENTO_ID: 11, DATA_CRIACAO: 12
  },
  FINANCEIRO: {
    ID: 0, TIPO: 1, VALOR: 2, DATA: 3, DESCRICAO: 4, FORMA_PAGAMENTO: 5, CATEGORIA: 6, AGENDAMENTO_ID: 7
  }
};

// ─── Cache da planilha: abre uma vez por requisição e reutiliza ───
// Sem isso, cada função chamava SpreadsheetApp.openById() separadamente,
// multiplicando o tempo de resposta. Com isso, abre uma vez só por chamada.
var _ss = null;
function getSpreadsheet() {
  if (!_ss) _ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _ss;
}

function getSheetOrThrow(nomeAba) {
  var sheet = getSpreadsheet().getSheetByName(nomeAba);
  if (!sheet) throw new Error('Aba não encontrada: ' + nomeAba);
  return sheet;
}

// ─── doGet: Responde às requisições GET (acesso via navegador) ───
// Quando alguém abre a URL do Web App no navegador, esta função é chamada.
// Ela retorna a página HTML principal da aplicação.
function doGet(e) {
  // Se houver uma ação GET específica, roteia para handleRequest
  if (e.parameter && e.parameter.action) {
    return handleRequest(e);
  }
  // Caso contrário, retorna a interface HTML da aplicação
  var html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Fisio Agenda')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

// ─── doPost: Responde às requisições POST (enviadas pelo JavaScript) ───
// O frontend (index.html) envia dados via fetch() como POST.
// Esta função recebe esses dados e os encaminha para handleRequest.
function doPost(e) {
  return handleRequest(e);
}

// ─── handleRequest: Decide qual função chamar com base na "action" ───
// A "action" é um parâmetro que o frontend envia junto com os dados.
// Ex: action='getClientes' → chama getClientes()
//     action='saveAgendamento' → chama saveAgendamento(dados)
function handleRequest(e) {
  try {
    // Lê a ação tanto de parâmetros GET quanto do corpo POST (JSON)
    var action = '';
    var dados = {};

    if (e.parameter && e.parameter.action) {
      // Requisição GET com parâmetro ?action=xxx
      action = e.parameter.action;
      dados = e.parameter;
    } else if (e.postData && e.postData.contents) {
      // Requisição POST com corpo JSON
      try {
        dados = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return responder({ erro: 'JSON inválido no corpo da requisição.' });
      }
      action = dados.action;
    }

    var authErro = validarAutorizacaoOpcional(dados);
    if (authErro) return responder({ erro: authErro });

    // ── Roteamento: cada action chama uma função específica ──

    // Módulo: Inicialização
    if (action === 'inicializar')         return responder(inicializarPlanilha());

    // Módulo: Clientes
    if (action === 'getClientes')         return responder(getClientes());
    if (action === 'saveCliente')         return responder(saveCliente(dados));
    if (action === 'deleteCliente')       return responder(deleteCliente(dados.id));

    // Módulo: Agendamentos
    if (action === 'getAgendamentos')     return responder(getAgendamentos(dados));
    if (action === 'saveAgendamento')     return responder(saveAgendamento(dados));
    if (action === 'updateStatusAgendamento') return responder(updateStatusAgendamento(dados));
    if (action === 'deleteAgendamento')   return responder(deleteAgendamento(dados.id));

    // Módulo: Financeiro
    if (action === 'getLancamentos')      return responder(getLancamentos(dados));
    if (action === 'saveLancamento')      return responder(saveLancamento(dados));
    if (action === 'deleteLancamento')    return responder(deleteLancamento(dados.id));

    // Módulo: Dashboard (usa funções da camada de serviços)
    if (action === 'getBootstrap')        return responder(getBootstrap(dados.mes, dados.ano, dados.incluirDashboard));
    if (action === 'getDashboard')        return responder(getDashboard(dados.mes, dados.ano));
    if (action === 'getResumoMes')        return responder(getResumoMes(dados.mes, dados.ano));
    if (action === 'getGraficoMeses')     return responder(getGraficoMeses(dados.meses));
    if (action === 'getTopCategorias')    return responder(getTopCategoriasDespesa(dados.mes, dados.ano));

    // Pagamentos
    if (action === 'registrarPagamento')  return responder(registrarPagamento(dados));

    // Diagnóstico
    if (action === 'testarAgendamentos')  return responder(testarAgendamentosHoje());

    // Ação não encontrada — retorna erro
    return responder({ erro: 'Ação não reconhecida: ' + action });

  } catch (err) {
    // Se der qualquer erro, retorna a mensagem de erro em JSON
    Logger.log('Erro em handleRequest: ' + err.message);
    return responder({ erro: err.message });
  }
}

function validarAutorizacaoOpcional(dados) {
  try {
    var chaveEsperada = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!chaveEsperada) return '';
    if (!dados || String(dados.apiKey || '') !== String(chaveEsperada)) {
      return 'Não autorizado.';
    }
    return '';
  } catch (e) {
    return '';
  }
}

// ─── responder: Formata a resposta como JSON ───
// Toda função deve retornar seus dados aqui para serem enviados ao frontend.
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── inicializarPlanilha: Cria todas as abas na primeira execução ───
// Execute esta função manualmente uma vez antes de publicar o Web App.
// Ela cria as abas "Clientes", "Agendamentos" e "Financeiro" com os cabeçalhos.
function inicializarPlanilha() {
  var ss = getSpreadsheet();

  // Definição das abas e seus cabeçalhos
  var abas = [
    {
      nome: 'Clientes',
      cabecalhos: ['ID', 'Nome', 'Telefone', 'Email', 'DataNascimento', 'Observacoes', 'DataCadastro']
    },
    {
      nome: 'Agendamentos',
      cabecalhos: ['ID', 'ClienteID', 'ClienteNome', 'Data', 'Horario', 'Duracao', 'TipoAtendimento', 'Valor', 'FormaPagamento', 'Status', 'Observacoes', 'EventoCalendarID', 'DataCriacao']
    },
    {
      nome: 'Financeiro',
      cabecalhos: ['ID', 'Tipo', 'Valor', 'Data', 'Descricao', 'FormaPagamento', 'Categoria', 'AgendamentoID', 'DataCriacao']
    }
  ];

  var criadas = [];

  abas.forEach(function(aba) {
    var sheet = ss.getSheetByName(aba.nome);
    if (!sheet) {
      // Cria a aba se não existir
      sheet = ss.insertSheet(aba.nome);
      sheet.getRange(1, 1, 1, aba.cabecalhos.length).setValues([aba.cabecalhos]);
      // Formata o cabeçalho com negrito e cor de fundo
      sheet.getRange(1, 1, 1, aba.cabecalhos.length)
        .setFontWeight('bold')
        .setBackground('#4CAF50')
        .setFontColor('#ffffff');
      criadas.push(aba.nome);
    }
  });

  return { sucesso: true, abasCriadas: criadas, mensagem: 'Planilha inicializada com sucesso!' };
}

// ─── gerarID: Gera um ID único baseado no timestamp ───
// Usado para criar IDs únicos para clientes, agendamentos e lançamentos.
function gerarID() {
  return new Date().getTime().toString() + '_' + Utilities.getUuid().substring(0, 8);
}
