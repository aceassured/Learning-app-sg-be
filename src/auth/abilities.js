// auth/abilities.js
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

export const defineAbilitiesFor = (user) => {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

  if (!user) return build(); // nothing allowed

  if (user.role === 'superadmin') {
    can('manage', 'all'); // full access
  }

  if (user.role === 'admin') {
    can('read', 'Page');    // read all pages
    can('create', 'User');  // can create users
    // add more admin rules here if needed
    // cannot('delete', 'User'); // example guardrail
  }

  return build({
    // lets you pass either a string subject ("Page") or an object with a "type" field
    detectSubjectType: (item) => item?.type || item
  });
};
