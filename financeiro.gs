// ============================================================
// financeiro.gs — Módulo Financeiro
// ============================================================
// Gerencia receitas e despesas da fisioterapeuta.
// Os dados ficam na aba "Financeiro" da planilha Google Sheets.
//
// Categorias de Receita: Atendimento, Outros
// Categorias de Despesa: Alimentação, Moradia, Aluguel, Condomínio,
//   Água, Luz, Telefone/Internet, Imposto/Contador,
//   Material clínico, Transporte, Outros
// ============================================================


// ─── getLancamentos: Retorna lançamentos financeiros com filtros ───
// Filtros possíveis: mes, ano, tipo ('receita' ou 'despesa'), periodo livre
function getLancamentos(filtros) {
  filtros = filtros || {};
  var dados = getDadosFinanceiro();
  return getLancamentosComDados(filtros, dados);
}

function getLancamentosComDados(filtros, dadosFinanceiro) {
  var resultado = [];

  // Define o período de filtragem
  var agora = new Date();
  var mes  = filtros.mes  ? parseInt(filtros.mes)  : null;
  var ano  = filtros.ano  ? parseInt(filtros.ano)  : null;
  var dataInicio = filtros.dataInicio ? new Date(filtros.dataInicio + 'T00:00:00') : null;
  var dataFim    = filtros.dataFim    ? new Date(filtros.dataFim + 'T23:59:59')    : null;
  var limite = filtros.limite ? parseInt(filtros.limite, 10) : 0;

  for (var i = 1; i < dadosFinanceiro.length; i++) {
    var linha = dadosFinanceiro[i];
    if (!linha[0]) continue; // pula linhas vazias

    // CORRIGIDO: o Sheets pode retornar Date object — converte para string antes
    var dataLanc = new Date(dataParaString(linha[3]) + 'T00:00:00');
    var inclui = true;

    // Filtra por mês/ano se informados
    if (mes && (dataLanc.getMonth() + 1) !== mes) inclui = false;
    if (ano && dataLanc.getFullYear() !== ano)     inclui = false;

    // Filtra por período livre se informado
    if (dataInicio && dataLanc < dataInicio) inclui = false;
    if (dataFim    && dataLanc > dataFim)   inclui = false;

    // Filtra por tipo (receita/despesa) se informado
    if (filtros.tipo && linha[COL.FINANCEIRO.TIPO] !== filtros.tipo) inclui = false;

    if (inclui) {
      resultado.push(linhaParaLancamento(linha));
    }
  }

  // Ordena do mais recente para o mais antigo
  resultado.sort(function(a, b) { return b.data.localeCompare(a.data); });

  // Paginação simples para reduzir payload em cenários de bootstrap
  if (limite > 0 && resultado.length > limite) {
    resultado = resultado.slice(0, limite);
  }

  return resultado;
}


// ─── saveLancamento: Cria um novo lançamento financeiro ───
// Os lançamentos automáticos (de atendimentos) são criados por agenda.gs.
// Esta função é para lançamentos manuais feitos pela fisioterapeuta.
function saveLancamento(dados) {
  var sheet = getSheetOrThrow(SHEET.FINANCEIRO);

  // Validações básicas
  if (!dados.tipo)   return { erro: 'Informe o tipo (receita ou despesa).' };
  if (!dados.valor)  return { erro: 'Informe o valor do lançamento.' };
  if (!dados.data)   return { erro: 'Informe a data do lançamento.' };
  if (dados.tipo !== 'receita' && dados.tipo !== 'despesa') {
    return { erro: 'Tipo inválido. Use receita ou despesa.' };
  }

  var valorNumerico = parseFloat(dados.valor);
  if (isNaN(valorNumerico) || valorNumerico <= 0) {
    return { erro: 'Valor inválido. Informe um valor maior que zero.' };
  }

  var dataNormalizada = normalizarDataISO(dados.data);
  if (!dataNormalizada) {
    return { erro: 'Data inválida. Use o formato YYYY-MM-DD.' };
  }

  var novoID = gerarID();
  var dataCriacao = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    novoID,
    dados.tipo,
    valorNumerico,
    dataNormalizada,
    dados.descricao || '',
    dados.formaPagamento || '',
    dados.categoria || 'Outros',
    dados.agendamentoID || '', // vazio para lançamentos manuais
    dataCriacao
  ]);

  invalidarCache();
  return { sucesso: true, mensagem: 'Lançamento salvo!', id: novoID };
}


// ─── deleteLancamento: Remove um lançamento financeiro pelo ID ───
function deleteLancamento(id) {
  var sheet = getSheetOrThrow(SHEET.FINANCEIRO);
  var dados = sheet.getDataRange().getValues();

  for (var i = dados.length - 1; i >= 1; i--) {
    if (dados[i][0] == id) {
      sheet.deleteRow(i + 1);
      invalidarCache();
      return { sucesso: true, mensagem: 'Lançamento removido!' };
    }
  }

  return { erro: 'Lançamento não encontrado.' };
}
