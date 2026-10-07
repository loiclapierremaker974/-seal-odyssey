function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * Prototype encounters: transient manifestations, not additional seal lineages
 * or canonical species. Rewards are configurable restoration/bond proposals.
 */
export const ENCOUNTERS = freeze([
  {
    id: 'shore-remnant',
    name: 'Le remous du rivage',
    arena: 'shore',
    position: { x: 4, z: 3 },
    radius: 1.7,
    description: "Une onde désaccordée trouble le Rivage d’Aelys. Observer ses mouvements permet de lui rendre son calme.",
    opponent: {
      name: 'Remous instable',
      element: 'current',
      maxResolve: 70,
      attack: 9,
      pattern: ['rush', 'pulse', 'gather'],
    },
    reward: { trust: 2, restoration: 1, label: 'Le rivage retrouve une respiration paisible.' },
  },
  {
    id: 'lagoon-knot',
    name: 'Le nœud de la lagune',
    arena: 'lagoon',
    position: { x: 5, z: -8 },
    radius: 1.8,
    description: "Des courants contrariés retiennent la Lagune des Murmures. Luma peut les dénouer sans blesser d’être vivant.",
    opponent: {
      name: 'Nœud de courant',
      element: 'water',
      maxResolve: 92,
      attack: 12,
      pattern: ['pulse', 'gather', 'rush'],
    },
    reward: { trust: 3, restoration: 2, label: 'Une circulation douce revient dans la lagune.' },
  },
  {
    id: 'ruins-resonance',
    name: 'La rémanence des ruines',
    arena: 'ruins',
    position: { x: -8, z: -16 },
    radius: 1.8,
    description: "Un écho de la Fracture résonne près des ruines. Protection et réconfort accompagnent son apaisement.",
    opponent: {
      name: 'Rémanence fracturée',
      element: 'light',
      maxResolve: 112,
      attack: 15,
      pattern: ['gather', 'pulse', 'rush', 'pulse'],
    },
    reward: { trust: 4, restoration: 3, label: 'La rémanence se fond dans le Grand Courant.' },
  },
]);

export default ENCOUNTERS;
