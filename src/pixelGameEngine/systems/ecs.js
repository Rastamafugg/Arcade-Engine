export const world = (() => {
  let nextId = 0;
  const store = new Map();
  const entities = new Set();
  return {
    createEntity(comps = {}) {
      const id = nextId++;
      entities.add(id);
      store.set(id, { ...comps });
      return id;
    },
    destroyEntity(id) { entities.delete(id); store.delete(id); },
    get: (id, name) => store.get(id)?.[name],
    set(id, name, data) { if (store.has(id)) store.get(id)[name] = data; },
    has: (id, name) => store.get(id)?.[name] !== undefined,
    query(...names) {
      const out = [];
      for (const id of entities) {
        const c = store.get(id);
        if (c && names.every(n => c[n] !== undefined)) out.push(id);
      }
      return out;
    },
    get allIds() { return entities; }
  };
})();