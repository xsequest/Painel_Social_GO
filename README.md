# Painel Goiás

Painel web para exploração de indicadores municipais do Cadastro Único e de programas sociais de Goiás. Combina mapa, tabela, gráficos e comparações históricas de Pobreza PBF para os 246 municípios do estado.

## Visão Geral

A aplicação é estática: HTML, CSS e módulos JavaScript executados no navegador, com bases JSON e malha municipal TopoJSON armazenadas no próprio projeto. Não há backend, banco de dados ou etapa de execução em Python.

O objetivo é apoiar a leitura comparativa dos indicadores e a identificação de municípios que merecem investigação adicional. As cores e os alertas são instrumentos exploratórios, não diagnósticos oficiais nem avaliações de impacto dos programas.

## Executar

### Requisitos

- Node.js 22, versão utilizada pelo workflow de integração contínua, e npm.
- Navegador moderno com JavaScript, módulos ES, Canvas e suporte às APIs utilizadas pela interface, como Fullscreen e Popover.
- Acesso à internet para instalar dependências e gerar os arquivos de terceiros. O mapa-base também utiliza imagens de um serviço externo.

Na raiz do projeto:

```sh
npm ci
npm run build
npm start
```

Abra <http://127.0.0.1:8080/>. Encerre o servidor com `Ctrl+C`.

`npm start` serve os arquivos da raiz e não recompila automaticamente o CSS. Após alterar classes Tailwind ou dependências, execute novamente `npm run build`.

Não abra `index.html` diretamente por `file://`: a aplicação carrega módulos e dados por HTTP.

### Build e Prévia

```sh
npm run build
npm run preview
```

A prévia fica em <http://127.0.0.1:8080/painel-goias/> e serve a pasta `dist/`.

O build copia as bibliotecas para `assets/vendor/`, compila `assets/css/utilities.css` e recria `dist/` com `index.html`, `assets/` e `output/`. Ele não coleta nem atualiza as bases de indicadores.

`npm start`, `npm run preview` e os testes de navegador usam a porta `8080`. Pare um servidor antes de iniciar outro. Alterações feitas nos fontes só aparecem na prévia após um novo build.

## Navegação e Recursos

### Abas e Visualizações

| Aba | Indicadores e controles | Visualizações |
| --- | --- | --- |
| CadÚnico | Extrema Pobreza, Pobreza e Pobreza PBF; escolha de paleta | Mapa e Tabela; Estatísticas somente em Pobreza PBF |
| Programas Sociais | Programa, status cadastral, métrica e paleta; modalidade própria para PLES | Mapa, Tabela e Correlação |

O painel inicia em CadÚnico, Extrema Pobreza, Mapa e tema claro. O estado da interface não é persistido entre recarregamentos.

No mapa de Pobreza PBF, os botões da legenda alternam entre `2019`, `2026` e `Diff 2026–2019`. Na legenda de Programas Sociais, `#` e `%` alternam quantidade absoluta e proporção populacional. Para mudar esses controles, retorne à visualização Mapa.

### Mapa e Painel Direito

- O mapa é coroplético: cada polígono representa um município, colorido pelo indicador selecionado. Não é uma superfície contínua de calor.
- O botão Ver círculos, abaixo de Reenquadrar, ativa o cartograma de círculos proporcionais ao valor bruto do indicador. Círculos maiores têm prioridade na localização; os menores ocupam posições livres próximas, sem grade ou agrupamento por criticidade. Ver territórios reverte a transição. A visualização é inspirada em “Land doesn't vote, people do”, de Karim Douïeb.
- No cartograma, programa, status e métrica definem a área; `#` e `%` mudam apenas as cores. Em Pobreza PBF, a área representa a contagem do ano selecionado; em Diff, usa a contagem de 2026 e a cor mostra a diferença em p.p. Zero e ausência não têm área. O deslocamento dos círculos não representa mudança geográfica dos municípios.
- Passe o ponteiro ou focalize um município para consultar o tooltip. Selecione-o por clique, Enter ou Espaço para abrir os dados no painel direito.
- O botão Localizar no mapa enquadra o município; Reenquadrar retorna ao estado inteiro. Selecionar um polígono, por si só, não exige mudança da câmera.
- Sem município selecionado, o painel mostra o agregado do recorte e um ranking dos cinco maiores ou menores valores. Os nomes do ranking são clicáveis e localizam o município no mapa.
- Com município selecionado, o painel mostra os dados municipais, a criticidade e os gráficos disponíveis. O selo de criticidade possui ajuda contextual; a mesma explicação está disponível em Filtros.
- Em Pobreza PBF, o card de inscritos reúne quantidade e percentual de 2019 e 2026, com diferença em pontos percentuais no rodapé. O card População Municipal compara os dois anos, a diferença em pessoas e a variação percentual.
- O painel inclui comparação município × Goiás; em Pobreza PBF há a alternativa `2026 - 2019`. A pizza aparece no CadÚnico com município selecionado, inclusive em Pobreza PBF 2026 e Diff, mas fica oculta em Pobreza PBF 2019. O radar aparece em Programas Sociais e pode ser ampliado em diálogo.
- Os painéis podem ser recolhidos sem apagar a seleção. O modo tela cheia é orientado ao mapa e mantém os painéis acessíveis; as configurações iniciam recolhidas e o painel municipal também é recolhido quando já existe município selecionado.

O mapa-base usa imagens externas do **Esri World Light Gray Base**. No tema escuro, a aplicação aplica um filtro visual à camada e clareia as bordas municipais.

### Programas Sociais

Há opções para Todos Programas, Mães de Goiás, Aprendiz do Futuro, Dignidade, Goiás Por Elas, Goiás + Inclusivo, Passe Livre Estudantil, Carteira de Identificação do Autista, Passe Livre da Pessoa com Deficiência e Passaporte da Pessoa Idosa.

Os controles gerais oferecem status `Acumulado`, `Ativo` e `Descredenciado` e métricas `Benefícios` ou `Pessoas`. O estado inicial é Ativo/Benefícios, no modo absoluto. A aplicação lê os valores consolidados da base: não recompõe Todos Programas ou Acumulado somando os demais campos durante a navegação.

PLES usa um seletor próprio de modalidade, obtido das colunas `PLES_*`; os controles gerais de status e métrica ficam ocultos. CAUT permite somente o status Ativo.

### Filtros e Seleção

Busca pelo nome municipal, Macrorregião SUAS, status do indicador e faixa populacional são combinados e compartilhados entre as visualizações. A busca ignora acentos e diferenças entre maiúsculas e minúsculas; não é uma busca pelo código IBGE.

Macrorregião SUAS oferece Centro Norte, Centro Sudeste, Centro-Oeste, Nordeste e Sudoeste, além de Todas as macrorregiões. As opções são extraídas do campo `macrorregiao_sus` da base atual. A referência apresentada no rótulo é “Resolução CIB n. 07/2026 - Diário Oficial - GO n. 24.803”.

As faixas implementadas são população menor que 20.000, de 20.000 a 100.000 inclusive, acima de 100.000 ou intervalo personalizado. Apesar do rótulo `Até 20 mil`, exatamente 20.000 entra na faixa intermediária. Mínimo e máximo personalizados são inclusivos e opcionais; entradas inválidas preservam os últimos limites válidos.

Em Pobreza PBF 2019, o filtro populacional usa a população de 2019. Em 2026, Diff e nos demais indicadores, usa a população atual.

Selecionar um município não equivale a filtrá-lo. A seleção é compartilhada entre mapa, tabela, dispersão e painel, mas pode permanecer ativa mesmo quando o município deixa de pertencer ao recorte filtrado. A Correlação identifica essa situação no seletor municipal. A tabela principal permite selecionar, mas não realça a linha como o mapa realça o polígono.

O botão Limpar dos filtros redefine busca, macrorregião, criticidade e população, sem redefinir o indicador, o programa ou o município selecionado. Trocar entre as abas principais limpa a seleção municipal; clicar no fundo do mapa também a limpa.

### Tabela e Exportação

A tabela oferece ordenação por cabeçalho, busca sincronizada e seleção municipal. Em Programas Sociais, as colunas gerais incluem simultaneamente benefícios, pessoas e percentual de pessoas, independentemente da métrica usada na cor do mapa. PLES e os modos históricos de PBF possuem colunas próprias.

A exportação XLSX da tabela principal respeita o recorte, a configuração e a ordenação da tabela e gera as planilhas `Dados Numericos`, `Formatado` e `Metadados`. A biblioteca de exportação é carregada sob demanda. São exportadas as colunas da tabela, não todos os dados de todos os gráficos. Não há exportação nativa de mapa/gráficos para imagem, nem botões CSV ou PDF.

### Estatísticas de Pobreza PBF

Selecione CadÚnico → Pobreza PBF → Estatísticas. Essa visualização compara 2019 e 2026 simultaneamente, mesmo quando a legenda do mapa está em 2019, 2026 ou Diff. Ao sair do indicador Pobreza PBF, a visualização Estatísticas deixa de estar disponível.

- Resumo do recorte pareado: população, contagem PBF e taxas agregadas, além da contagem de municípios com redução, aumento ou estabilidade da taxa.
- Ranking de até 15 municípios, com comparação de taxas por gráfico dumbbell (dois pontos ligados), variação populacional em porcentagem ou diferença PBF em pessoas.
- Gráfico waterfall (cascata) das contribuições municipais para a diferença total de pessoas na faixa de renda PBF.
- Correlação entre variação populacional (%) e diferença da taxa PBF (p.p.), com enquadramento completo ou central de 95% por eixo.
- Tabela comparativa completa, ordenável, e tooltips acessíveis por ponteiro, foco de teclado ou toque.

Os filtros globais definem a amostra. Status e população usam 2019 quando esse ano está selecionado no mapa; em 2026 ou Diff, usam 2026. Assim, mudar o ano de referência pode mudar o recorte, mas não os dois anos comparados nas Estatísticas. O resumo agregado utiliza somente municípios com comparação completa; valores ausentes não viram zero.

A exportação própria gera `Pobreza_PBF_Estatisticas_2019_2026.xlsx`, com as planilhas `Comparativo 2019-2026` e `Metodologia e filtros`. Respeita o recorte e a ordenação da tabela estatística, incluindo macrorregião e metadados dos filtros. Células vazias indicam ausência de dado ou base zero para variação relativa; zero continua sendo valor válido.

## Fontes e Mapeamento

### Fontes Declaradas

O aplicativo utiliza os arquivos locais preparados a partir das bases; não consulta esses portais durante a navegação.

| Informação | Referência |
| --- | --- |
| CadÚnico: Extrema Pobreza e Pobreza | [TabCad / CECAD](https://cecad.cidadania.gov.br/tab_cad.php) |
| Série histórica denominada Pobreza PBF 2019 | [Pessoas inscritas no Cadastro Único por faixa de renda per capita](https://dados.gov.br/dados/conjuntos-dados/pessoas-inscritas-no-cadastro-unico-por-faixa-de-renda-per-capita), Portal Brasileiro de Dados Abertos |
| População estimada utilizada nos cenários 2019 e 2026 | [Tabela SIDRA 6579: População residente estimada](https://sidra.ibge.gov.br/tabela/6579), IBGE |
| Programas sociais estaduais | Base consolidada local `output/info_Programas_Sociais.json` |
| Macrorregião SUAS | Campo `macrorregiao_sus` de `output/info_tabcad.json`; referência exibida: Resolução CIB n. 07/2026 - Diário Oficial - GO n. 24.803 |
| Limites municipais temáticos | Malha local `output/municipios_GO.topojson` |


### Arquivos e Campos

Os três arquivos de indicadores são objetos indexados pelo código IBGE municipal, como `5200050`, e não arrays de registros.

| Arquivo | Campos de entrada relevantes | Propriedades internas / finalidade |
| --- | --- | --- |
| `output/info_tabcad.json` | `município` | Nome municipal preferencial |
| `output/info_tabcad.json` | `macrorregiao_sus` | Macrorregião SUAS; filtro global e identificação regional nas Estatísticas |
| `output/info_tabcad.json` | `populacao_estimada` | `população`, usada no cenário atual/2026 |
| `output/info_tabcad.json` | `ext_pob`, `pob` | Quantidades de extrema pobreza e pobreza |
| `output/info_tabcad.json` | `pob_pbf` | `pob_p1_p2`, quantidade denominada Pobreza PBF |
| `output/info_2019.json` | `populacao_estimada_2019` | `população_2019`, denominador histórico |
| `output/info_2019.json` | `pob_pbf_2019` | `PBF_2019`, quantidade histórica |
| `output/info_Programas_Sociais.json` | `municipio`, campos de programas e `PLES_*` | Nome alternativo e medidas dos programas |
| `output/municipios_GO.topojson` | Objeto `municipios`; propriedades de código e nome | Polígonos convertidos para GeoJSON no carregamento |

A junção usa o código da geometria na ordem `properties.id`, `properties.code_muni`, `feature.id`, convertido para string. O formato aceito é `^52\d{5}$`. Cada código deve existir nas três bases; registros sem geometria correspondente são rejeitados. Os nomes não são usados como chave de junção.

O nome final vem de `município` do TabCad, `municipio` dos programas ou dos nomes da geometria, nessa ordem. O nome presente no histórico não substitui essa precedência.

### Contrato dos Programas

Os campos regulares seguem `{programa}_{status}_{métrica}`, por exemplo `MAES_Ativo_Beneficios`.

| Componente | Valores do contrato |
| --- | --- |
| Programa | `MAES`, `AFUT`, `DIGN`, `GPEL`, `GINC`, `CAUT`, `PLPD`, `PPID`, `TODS` |
| Status | `Acumulado`, `Ativo`, `Descredenciado` |
| Métrica | `Beneficios`, `Pessoas` |

PLES tem nove campos próprios obrigatórios: `PLES_Ativo_Beneficios` e oito modalidades de ensino. Exemplos são `PLES_FUNDAMENTAL`, `PLES_MÉDIO` e `PLES_SUPERIOR - GRADUAÇÃO`. A grafia, os espaços e os acentos dessas chaves devem ser preservados. A lista completa está em [`assets/js/data.js`](assets/js/data.js).

## Cálculo e Validações

### Contagens e Proporções

Os campos internos chamados `norm_*` são razões por população, não normalização min–max, escore-z ou densidade por área:

```text
norm_ext       = ext_pob / população
norm_pob       = pob / população
norm_pob_p1_p2 = pob_p1_p2 / população
norm_PBF_2019  = PBF_2019 / população_2019

Percentual exibido = razão × 100
Programa em #     = quantidade da coluna selecionada
Programa em %     = 100 × quantidade / população municipal
```

Zero é um valor conhecido e produz proporção zero. `null` representa quantidade desconhecida e não pode ser convertido em zero. As populações de entrada precisam ser estritamente positivas. As razões não são limitadas artificialmente a 100%; o carregador não garante que toda contagem seja menor que a população.

Os cálculos preservam a precisão; o arredondamento ocorre na exibição em formato brasileiro, normalmente com duas casas para percentuais.

### Pobreza PBF: 2026 e 2019

Pobreza PBF representa pessoas inscritas por faixa de renda, não beneficiários do Bolsa Família. São dois retratos, não uma série anual: a base atual é identificada como CadÚnico agosto/2026; o mês da contagem de 2019 não está informado. “População 2026” denomina o cenário atual, mas o arquivo não explicita o ano efetivo de referência dessa estimativa. Mudanças cadastrais, de renda e de estimativa populacional podem afetar a comparação.

```text
Taxa 2019 = 100 × PBF_2019 / população_2019
Taxa 2026 = 100 × pob_p1_p2 / população
Diferença em p.p. = Taxa 2026 − Taxa 2019
```

A diferença de taxas é expressa em **pontos percentuais**, não crescimento percentual relativo e não diferença em pessoas. Cada ano utiliza sua própria população.

Na base atual, Abadia de Goiás ilustra essa distinção: a contagem passa de 4.841 para 7.270, enquanto a população usada passa de 8.773 para 22.918. A taxa cai de aproximadamente 55,18% para 31,72%, ou cerca de 23,46 p.p., apesar do aumento da contagem.

### Agregados

O percentual agregado é `100 × soma dos valores conhecidos / soma das populações correspondentes`. Não é a média simples das taxas dos municípios. Zero entra como conhecido; municípios com indicador `null` não entram no denominador desse indicador.

O card de população do resumo pode mostrar a população de todo o recorte, enquanto o percentual usa somente o denominador compatível com o indicador conhecido. Esses totais não precisam coincidir quando há dados ausentes.

No Diff agregado, entram apenas municípios com as duas populações e as duas contagens válidas. A aplicação calcula as duas razões agregadas nessa amostra pareada e depois as subtrai; não tira a média dos deltas municipais.

### Variação Populacional

```text
v = 100 × (população 2026 − população 2019) / população 2019
L = média aritmética de |v| dos municípios com variação válida
Destaque/aviso quando |v| > L
```

A referência considera a base completa, sem ponderação populacional e independentemente dos filtros. É calculada uma vez por carregamento. Igualdade ao limiar não dispara o destaque.

O mesmo critério sinaliza crescimento e queda: no card, destaca a variação percentual; no tooltip PBF, produz o aviso de mudança populacional acentuada. Não é uma taxa anualizada, a variação do total de Goiás ou um teste estatístico de anomalia. O alerta chama atenção para o denominador, mas não identifica a causa nem comprova erro na estimativa.

### Validações de Entrada

- JSONs de indicadores devem ser objetos, com registros municipais e campos obrigatórios presentes.
- Contagens conhecidas devem ser inteiros seguros não negativos. Strings numéricas não são aceitas na base; `null` é permitido para contagem desconhecida, não para população.
- Populações devem ser inteiros seguros maiores que zero; o nome final deve ser uma string não vazia.
- O campo obrigatório `macrorregiao_sus` deve ser uma string não vazia; a chave técnica é preservada embora o rótulo da interface seja Macrorregião SUAS.
- Os códigos geométricos precisam seguir o padrão esperado e não podem se repetir; cada geometria deve ter os três registros e cada registro deve ter geometria.
- A malha deve conter polígonos ou multipolígonos, com coordenadas finitas dentro dos limites de longitude/latitude e anéis fechados com pelo menos quatro posições.
- Falhas HTTP, JSON inválido ou violações do contrato interrompem a inicialização e são apresentadas como erro, em vez de descartar silenciosamente municípios.

O formato do código não valida o dígito verificador nem consulta um cadastro oficial. A validação geométrica não comprova ausência de autointerseções, lacunas ou sobreposições. Também não há detector próprio de chaves duplicadas nos JSONs de indicadores antes do parser; isso é diferente da detecção de IDs geométricos repetidos.

Existe uma auditoria de totais de programas em modo dry-run, acessível no console do navegador:

```js
window.runProgramTotalsDryRun()
```

Ela produz diagnósticos de campos, somas e composição de `TODS`; pode receber totais estaduais esperados para comparação. Na inicialização, é chamada sem totais oficiais de referência. Não substitui a conciliação com a fonte nem comprova que `TODS` seja soma simples de programas, que `Acumulado = Ativo + Descredenciado` ou que não haja sobreposição de pessoas.

## Classificação e Análise Espacial

### Criticidade

O status do indicador compara uma proporção municipal com uma referência da base completa. Para CadÚnico, usa-se a proporção do indicador na população; para Programas Sociais, a métrica selecionada dividida pela população municipal, mesmo se o mapa estiver no modo absoluto.

A referência é o P95 dos valores positivos válidos. A rotina ordena os valores e seleciona a posição de índice `min(n - 1, floor(n × 0,95))`, sem interpolação. Quando não há referência positiva utilizável, aplica o valor padrão: `0,6` para as proporções de pobreza e `1` para programas. Zero continua sendo válido para a classificação, embora não componha a amostra positiva do P95.

Definindo `r = proporção municipal / referência`:

| Status | CadÚnico | Programas Sociais |
| --- | --- | --- |
| Estável | `r ≤ 0,40` | `r > 0,75` |
| Alerta | `0,40 < r ≤ 0,75` | `0,40 < r ≤ 0,75` |
| Crítico | `r > 0,75` | `r ≤ 0,40` |
| Sem Dados | Valor ausente | Valor ausente |

Assim, 40% e 75% são frações da referência, não percentuais diretos da população. Os filtros não recalculam a referência. Em Diff PBF, o status continua classificando a proporção de 2026, não a diferença histórica.

O status do indicador não é o status cadastral do programa. Nos programas, a regra de menor proporção/maior criticidade também se aplica às métricas selecionadas sob Descredenciado; por isso, os rótulos não devem ser interpretados automaticamente como medida de bom desempenho, elegibilidade ou impacto.

### Cores do Mapa e Variações

As escalas comuns utilizam referência baseada no P95 da distribuição da métrica. Isso ajusta a escala visual, sem excluir os municípios acima do teto. A paleta pode ser alterada pelo usuário e não deve ser confundida com as cores fixas do selo de criticidade.

Os percentuais textuais de alguns cards de pobreza usam uma referência fixa de `0,6`, enquanto mapa e status utilizam referências dinâmicas. Portanto, nem toda cor de texto equivale ao status do município. As amostras da legenda representam uma escala contínua, não classes estatísticas de municípios.

Em Diff PBF, a escala é simétrica, baseada nas magnitudes das diferenças em pontos percentuais. Diferenças de `−2` a `+2 p.p.`, inclusive, ficam sem preenchimento; essa é uma regra visual, não um intervalo de confiança ou teste de significância. Valores ausentes têm tratamento próprio.

Nos cards e textos de variação PBF, aumentos usam rosa/vermelho e reduções usam verde. A diferença populacional em pessoas permanece neutra; a variação percentual recebe destaque laranja quando supera a referência de magnitude descrita na metodologia. O tooltip municipal de PBF também avisa sobre quedas ou crescimentos acentuados, nos modos 2019, 2026 e Diff.

### Correlação Descritiva

Na aba Programas Sociais, a dispersão compara:

```text
X = 100 × extrema pobreza / população municipal
Y = 100 × métrica selecionada do programa / população municipal
```

O eixo Y permanece percentual mesmo quando o mapa usa quantidades absolutas. Somente municípios com ambos os valores válidos participam da análise.

As linhas dos quadrantes são médias aritméticas municipais, sem ponderação populacional, calculadas na base completa com pares válidos. Os filtros alteram os pontos exibidos, mas não essas referências. Valores iguais à média entram na categoria alta. Os quadrantes combinam alta/baixa extrema pobreza com alta/baixa proporção do programa no próprio município.

A listagem detalhada calcula a correlação de Pearson para o recorte exibido. O coeficiente fica indisponível com menos de dois pares válidos ou variância nula. O gráfico oferece seleção, tooltips, ampliação em diálogo e zoom visual; não realiza regressão, cálculo de p-valor ou intervalo de confiança.

A listagem permite ordenação por coluna. O seletor municipal e seu botão Limpar controlam a seleção compartilhada, não o recorte dos filtros. O zoom visual varia de 75% a 250%, com restauração para 100%.

### Correlação nas Estatísticas PBF

É uma análise distinta da Correlação de Programas Sociais: `X = 100 × (população 2026 − população 2019) / população 2019` e `Y = Taxa PBF 2026 − Taxa PBF 2019`, em p.p. Pearson usa os pares municipais válidos do recorte, sem ponderação populacional, e fica indisponível com menos de três pares ou variância nula em algum eixo.

O enquadramento central de 95% usa os percentis 2,5 e 97,5 de cada eixo, com interpolação. Altera somente os eixos e os pontos visíveis: Pearson, tabela e exportação mantêm a amostra completa do recorte. Não é intervalo de confiança nem garante que 95% dos pontos fiquem visíveis conjuntamente; com menos de três pares, usa o enquadramento completo.

A população também compõe o denominador da taxa PBF e pode influenciar a associação observada. A correlação não demonstra causalidade, impacto de políticas ou significância estatística.

### Alcance e Limitações

- A análise espacial inclui a visualização coroplética municipal e o cartograma de círculos proporcionais. Não há Moran global/local, LISA, matriz de vizinhança, defasagem espacial ou testes de agrupamentos espaciais.

## Estrutura

```text
.
|-- index.html                    # Interface e pontos de montagem
|-- assets/
|   |-- css/
|   |   |-- dashboard.css         # Layout e estilos específicos
|   |   |-- tailwind.css          # Entrada do Tailwind
|   |   `-- utilities.css         # CSS gerado pelo build
|   |-- js/
|   |   |-- bootstrap.js          # Inicialização e carregamento de dependências
|   |   |-- data.js               # Leitura, validação e junção dos dados
|   |   |-- core.js               # Estado, métricas e funções de cálculo
|   |   |-- app.js                # Coordenação dos módulos e filtros
|   |   |-- controls.js           # Controles da interface e ajuda contextual
|   |   |-- map.js                # Mapa, legenda, estilos e tooltips
|   |   |-- cartogram.js          # Geometria e disposição dos círculos proporcionais
|   |   |-- panel.js              # Resumo, cards e gráficos do painel direito
|   |   |-- scatter.js            # Visualização de correlação
|   |   |-- statistics-data.js    # Cálculos comparativos e enquadramento estatístico
|   |   |-- statistics.js         # Gráficos, tabela e exportação das Estatísticas PBF
|   |   `-- table.js              # Tabela, ordenação e exportação
|   `-- vendor/                   # Bibliotecas, imagens e licenças locais
|-- output/
|   |-- info_tabcad.json
|   |-- info_2019.json
|   |-- info_Programas_Sociais.json
|   `-- municipios_GO.topojson
|-- scripts/
|   |-- vendor.mjs                # Distribuições de terceiros e integridade
|   |-- vendor-manifest.json      # Versão, URL e SHA-256 do SheetJS
|   |-- build-site.mjs            # Geração de dist/
|   `-- serve.mjs                 # Servidor HTTP local
|-- tests/
|   |-- core.test.js              # Testes unitários
|   |-- dashboard.spec.js         # Fluxos funcionais no navegador
|   |-- statistics.test.js        # Cálculos das Estatísticas PBF
|   |-- statistics.spec.js        # Filtros, gráficos e exportação das Estatísticas
|   |-- cartogram.test.js         # Geometria do cartograma
|   |-- cartogram.spec.js         # Transições e interação do cartograma
|   `-- chart-lifecycle.spec.js   # Ciclo de vida e interação dos gráficos
|-- .github/workflows/pages.yml   # Testes, build e publicação
|-- playwright.config.js
|-- tailwind.config.cjs
|-- package.json
`-- package-lock.json
```

`dist/`, `node_modules/` e os relatórios de testes são artefatos gerados e não constituem a fonte da aplicação.

## Validação e Documentação

```sh
npm test
npm run build
npx playwright test
```

Para a primeira execução dos testes de navegador, instale o Chromium com `npx playwright install chromium`. O Playwright testa a prévia de `dist/`; execute o build após alterar os fontes para não validar uma cópia antiga.

O Guia de uso e metodologia exibido no botão Sobre o painel e metodologia tem conteúdo próprio em `index.html`, organizado a partir deste README. Não há conversão automática de Markdown: alterações de recursos, fontes ou critérios metodológicos devem ser refletidas nos dois arquivos. O guia omite deliberadamente instruções de desenvolvimento, execução e estrutura do repositório.
