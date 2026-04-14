// ============================================================
// clientes.gs — Módulo de Clientes
// ============================================================
// Contém todas as operações de CRUD (criar, ler, atualizar, deletar)
// para os clientes da fisioterapeuta.
// Os dados são salvos na aba "Clientes" da planilha Google Sheets.
// ============================================================


// ─── getClientes: Retorna todos os clientes cadastrados ───
// Chamado pelo frontend quando o usuário abre a aba "Clientes".
// Usa getClientesPorNome de servicos.gs para busca com filtro.
function getClientes(filtroNome) {
  if (filtroNome) {
    // Se passou um filtro de nome, usa a função de serviço
    return getClientesPorNome(filtroNome);
  }

  // Sem filtro: retorna todos os clientes
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Clientes');

  // getDataRange() pega todos os dados (incluindo cabeçalho)
  var dados = sheet.getDataRange().getValues();
  var clientes = [];

  // Começa do índice 1 para pular o cabeçalho (linha 0)
  for (var i = 1; i < dados.length; i++) {
    var linha = dados[i];
    // Ignora linhas completamente vazias
    if (!linha[0]) continue;
    clientes.push(linhaParaCliente(linha));
  }

  // Ordena por nome alfabeticamente
  clientes.sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

  return clientes;
}


// ─── saveCliente: Cria um novo cliente ou atualiza um existente ───
// Se o objeto 'dados' tiver um 'id', atualiza o registro existente.
// Se não tiver 'id', cria um novo registro.
function saveCliente(dados) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Clientes');

  if (dados.id) {
    // ── Atualização: procura a linha com o ID e substitui os dados ──
    var todasLinhas = sheet.getDataRange().getValues();
    for (var i = 1; i < todasLinhas.length; i++) {
      if (todasLinhas[i][0] == dados.id) {
        // Atualiza a linha encontrada (sem alterar o ID e a data de cadastro)
        sheet.getRange(i + 1, 1, 1, 7).setValues([[
          dados.id,
          dados.nome || '',
          dados.telefone || '',
          dados.email || '',
          dados.dataNascimento || '',
          dados.observacoes || '',
          todasLinhas[i][6] // mantém a data de cadastro original
        ]]);
        return { sucesso: true, mensagem: 'Cliente atualizado!', id: dados.id };
      }
    }
    return { erro: 'Cliente não encontrado para atualização.' };

  } else {
    // ── Criação: adiciona uma nova linha no final da aba ──
    var novoID = gerarID();
    var dataCadastro = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    sheet.appendRow([
      novoID,
      dados.nome || '',
      dados.telefone || '',
      dados.email || '',
      dados.dataNascimento || '',
      dados.observacoes || '',
      dataCadastro
    ]);
    return { sucesso: true, mensagem: 'Cliente cadastrado!', id: novoID };
  }
}


// ─── deleteCliente: Remove um cliente da planilha pelo ID ───
// Cuidado: não verifica se o cliente tem agendamentos futuros.
// No futuro, pode ser interessante adicionar essa verificação.
function deleteCliente(id) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Clientes');
  var dados = sheet.getDataRange().getValues();

  // Percorre as linhas de baixo para cima para não deslocar os índices ao deletar
  for (var i = dados.length - 1; i >= 1; i--) {
    if (dados[i][0] == id) {
      sheet.deleteRow(i + 1); // +1 porque o array começa em 0 mas as linhas da planilha em 1
      return { sucesso: true, mensagem: 'Cliente removido!' };
    }
  }

  return { erro: 'Cliente não encontrado.' };
}
