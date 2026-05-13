import { saveUserData, loadUserData } from '../firebaseService';
import { CategoryTree, CategoryNode } from '../../types';

const FIRESTORE_KEY = 'categoryTree';

export const loadCategoryTree = (uid: string): Promise<CategoryTree> =>
  loadUserData<CategoryTree>(uid, FIRESTORE_KEY, {});

export const saveCategoryTree = (uid: string, tree: CategoryTree): Promise<void> =>
  saveUserData(uid, FIRESTORE_KEY, tree);

/** Gera o próximo ID sequencial baseado nos IDs existentes. */
const nextId = (tree: CategoryTree): string => {
  const ids = Object.keys(tree).map(Number).filter(n => !isNaN(n));
  const max = ids.length > 0 ? Math.max(...ids) : 0;
  return String(max + 1).padStart(2, '0');
};

export const addCategoryNode = (
  tree: CategoryTree,
  nome: string,
  pai: string | null
): { tree: CategoryTree; newId: string } => {
  const id = nextId(tree);
  const newNode: CategoryNode = { nome: nome.trim(), pai };
  return { tree: { ...tree, [id]: newNode }, newId: id };
};

export const renameCategoryNode = (
  tree: CategoryTree,
  id: string,
  novoNome: string
): CategoryTree => ({
  ...tree,
  [id]: { ...tree[id], nome: novoNome.trim() },
});

export const moveCategoryNode = (
  tree: CategoryTree,
  id: string,
  novoPai: string | null
): CategoryTree => ({
  ...tree,
  [id]: { ...tree[id], pai: novoPai },
});

export const deleteCategoryNode = (tree: CategoryTree, id: string): CategoryTree => {
  const next = { ...tree };
  delete next[id];
  return next;
};

/** Retorna os IDs filho direto de um nó (ou de raiz quando pai=null). */
export const getChildren = (tree: CategoryTree, pai: string | null): string[] =>
  Object.entries(tree)
    .filter(([, node]) => node.pai === pai)
    .map(([id]) => id)
    .sort((a, b) => tree[a].nome.localeCompare(tree[b].nome, 'pt-BR'));

/** true se o nó tem filhos. */
export const hasChildren = (tree: CategoryTree, id: string): boolean =>
  Object.values(tree).some(n => n.pai === id);

/** Caminho completo como array de nomes (raiz → folha). */
export const buildBreadcrumb = (tree: CategoryTree, id: string): string[] => {
  const crumb: string[] = [];
  let current: string | null = id;
  const visited = new Set<string>();
  while (current && tree[current] && !visited.has(current)) {
    visited.add(current);
    crumb.unshift(tree[current].nome);
    current = tree[current].pai;
  }
  return crumb;
};

/** Caminho completo como string separada por ' > '. */
export const buildPath = (tree: CategoryTree, id: string): string =>
  buildBreadcrumb(tree, id).join(' > ');

/** Retorna todos os IDs descendentes de um nó (incluindo ele mesmo). */
export const getDescendantIds = (tree: CategoryTree, id: string): string[] => {
  const result: string[] = [id];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = getChildren(tree, current);
    result.push(...children);
    queue.push(...children);
  }
  return result;
};

/**
 * Encontra o ID do nó mais profundo que corresponde ao caminho legado.
 * Ex: "1 - BEBIDAS>>CERVEJAS E CHOPPS>>Cervejas Garrafa Long Neck"
 * → retorna ID do nó mais profundo encontrado na árvore (match parcial válido)
 */
export const findNodeByLegacyPath = (
  tree: CategoryTree,
  legacyStr: string
): string | null => {
  const parts = legacyStr.split('>>').map(s => s.trim()).filter(Boolean);
  let pai: string | null = null;
  let lastMatchedId: string | null = null;

  for (const nome of parts) {
    const match = Object.entries(tree).find(
      ([, n]) => n.nome.toLowerCase() === nome.toLowerCase() && n.pai === pai
    );
    if (!match) break;
    pai = match[0];
    lastMatchedId = match[0];
  }
  return lastMatchedId;
};

/**
 * Sugere nós a importar do formato legado ">>" de uma lista de strings de categoria.
 * Retorna uma árvore nova com os nós sugeridos (sem duplicatas de nome).
 */
export const importFromLegacyStrings = (
  tree: CategoryTree,
  legacyCategories: string[]
): CategoryTree => {
  let current = { ...tree };

  for (const raw of legacyCategories) {
    if (!raw || raw === 'Sem categoria') continue;
    const parts = raw.split('>>').map(s => s.trim()).filter(Boolean);
    let pai: string | null = null;

    for (const nome of parts) {
      // Verifica se já existe um nó com este nome e mesmo pai
      const existing = Object.entries(current).find(
        ([, n]) => n.nome.toLowerCase() === nome.toLowerCase() && n.pai === pai
      );
      if (existing) {
        pai = existing[0];
      } else {
        const result = addCategoryNode(current, nome, pai);
        current = result.tree;
        pai = result.newId;
      }
    }
  }

  return current;
};
