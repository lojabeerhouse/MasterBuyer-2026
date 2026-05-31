# CATO-DATA-INSTRUCTIONS — Diretrizes de Segurança do Firestore

<!-- ASSINATURA: 🛡️cdi. -->

## Quando acionar

Você deve ler esta skill **obrigatoriamente** sempre que a tarefa envolver:
1. Leitura de dados do Firestore (consultas, carregamentos, triggers de hooks).
2. Escrita de dados no Firestore (salvamentos, atualizações automáticas ou manuais).
3. Alteração ou criação de esquemas, coleções ou transações.

NÃO ler se a tarefa for puramente focada em UI/Estilização, lógica local do React, componentes ou manipulação de estados não persistidos.

---

## Diretrizes de Segurança contra Data Loss (Perda de Dados)

### 1. Padrão Delta (Coleção de Itens Individuais)
*Exemplos no app: `suppliers`, `purchaseOrders`, `catalogs`, `priceHistory`*
* **Proibido Sobrescrever:** É terminantemente proibido o uso de funções de escrita globais que reescrevam coleções inteiras com base no estado do frontend.
* **Escrita Granular:** Atualizações de dados devem utilizar `updateDoc` ou `setDoc(..., { merge: true })` apontando exclusivamente para o ID único do documento que foi alterado.
* **Exclusão Granular:** Itens devem ser removidos individualmente apontando para o seu respectivo ID de documento via `deleteDoc()`.

### 2. Envelope Genérico Blob (Chave Única)
*Exemplos no app: `cart`, `salesData`, `hiddenProducts`, `categoryTree`, etc. em `/users/{uid}/data/{key}`*
* **Trava de Hidratação:** Impedir a persistência automática caso a aplicação esteja carregando (`isLoading === true`) ou ainda não tenha sido totalmente hidratada (`isLoaded === false`).
* **Trava de Falha Crítica:** Caso a carga de uma chave falhe na inicialização, adicione a respectiva chave ao controle de falhas (ex: `failedCriticalLoads.current.add('key')`) e bloqueie totalmente a escrita automática dela durante a sessão para evitar a substituição dos dados reais em produção por um array vazio `[]`.
* **Esvaziamento Intencional:** Salvar um estado vazio (`length === 0`) só é permitido após carregamento inicial bem-sucedido e com parâmetro explícito de intenção (ex: `{ allowEmpty: true }`).

### 3. Operações em Massa (Importações de Planilha/CSV)
* **Controle de Lotes (Batches):** Inserções ou atualizações massivas de múltiplos documentos devem utilizar obrigatoriamente `writeBatch()` limitando fisicamente a no máximo 500 operações por lote.
* **Isolamento:** Garanta que operações em massa rodem isoladamente de estados de UI instáveis.
