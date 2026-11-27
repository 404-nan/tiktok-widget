// お試しを自動で始める前からいる配信者（支払いの記録が無い人）を作るテストヘルパー。
// create は新しい配信者にお試し（Pro）を付けるので、「今までどおり」を確かめるテストはこちらで作る。
export function createExistingTenant(tenants, options = {}) {
  const tenant = tenants.create(options);
  tenants.billing.remove(tenant.id);
  return tenant;
}
