// Client-only bundle: the Cordis host entry is a no-op shell so the package
// participates in composition; all branding lives in the client bundle.
const name = "dsh-root-brand";

function apply() {}

export { apply, name };
