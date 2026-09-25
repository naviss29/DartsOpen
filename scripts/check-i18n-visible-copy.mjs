// Garde-fou i18n : aucun texte visible ne doit être codé en dur dans le JSX (standard :
// BApps-Studio/04-Architecture/Internationalization-Standards.md).
//
// Analyse l'AST TypeScript des fichiers .tsx et signale : texte JSX, attributs de copie
// (title, label, placeholder, aria-label…), et setError/setMessage avec un littéral.
//
// MODE « CLIQUET » (baseline) : un produit dont la traduction n'est pas terminée liste ses
// écarts connus dans `scripts/i18n-visible-copy.baseline.json`. Le script échoue uniquement
// pour un NOUVEL écart ; supprimer un écart existant ne casse rien (relancer avec
// --update-baseline pour réduire la baseline). Baseline vide = produit entièrement conforme.
// Les clés ne contiennent pas le numéro de ligne : déplacer du code ne fait pas de faux positif.
//
// Usage : node scripts/check-i18n-visible-copy.mjs [--update-baseline]
// Ce fichier est identique dans BilletAsso, BSsite, Connect, DartsOpen, MarketPlace : seule la
// section CONFIG ci-dessous peut différer d'un produit à l'autre.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// ---------- CONFIG (adapter par produit) ----------
const roots = ["app", "components"];
// Dossiers/fichiers hors périmètre : routes API, tests, catalogues.
const excluded = [/[/\\]api[/\\]/, /\.test\.tsx$/, /[/\\]i18n[/\\]/];
// Textes visibles légitimement identiques dans toutes les langues (noms de marque, etc.).
const allowed = [
  /^(DartsOpen)$/,
  /^BApps Studio$/,
  /^by BApps Studio$/,
  /^QR code$/,
  /^i$/,
  /^[^\s@]+@[^\s@]+$/,
];
// ---------- FIN CONFIG ----------

const baselinePath = path.join("scripts", "i18n-visible-copy.baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");
const copyProps = new Set(["title", "subtitle", "label", "description", "hint", "placeholder", "aria-label"]);

function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

// Un texte sans aucune lettre (ponctuation, emoji, séparateurs) n'a rien à traduire.
function isAllowed(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return !normalized || !/\p{L}/u.test(normalized) || allowed.some((pattern) => pattern.test(normalized));
}

const files = roots.flatMap(filesIn).filter((file) => !excluded.some((pattern) => pattern.test(file)));
const found = []; // { key, display }
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const relativeFile = file.split(path.sep).join("/");
  const report = (node, value, kind) => {
    if (isAllowed(value)) return;
    const text = value.replace(/\s+/g, " ").trim();
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    found.push({ key: `${relativeFile}|${kind}|${text}`, display: `${relativeFile}:${line} [${kind}] ${text}` });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text, "texte JSX");
    if (ts.isJsxAttribute(node) && copyProps.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
      report(node, node.initializer.text, `attribut ${node.name.text}`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["setError", "setMessage"].includes(node.expression.text) &&
      node.arguments[0] &&
      (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      report(node, node.arguments[0].text, node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}

// Multiensemble clé -> occurrences (un même texte peut légitimement apparaître plusieurs fois).
const counts = {};
for (const { key } of found) counts[key] = (counts[key] ?? 0) + 1;

if (updateBaseline) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`i18n guardrail: baseline écrite (${found.length} écart(s) connus, ${files.length} fichiers TSX).`);
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") {
    // Une baseline illisible ne doit jamais valider silencieusement : on échoue.
    console.error(`i18n guardrail: baseline illisible (${baselinePath}) : ${error.message}`);
    process.exit(1);
  }
}

const consumed = { ...baseline };
const fresh = [];
for (const item of found) {
  if (consumed[item.key] > 0) consumed[item.key] -= 1;
  else fresh.push(item.display);
}

if (fresh.length) {
  console.error("Nouveaux textes visibles hors catalogue i18n (utiliser t(\"clé\") et les 3 catalogues) :\n" + fresh.join("\n"));
  process.exit(1);
}

const known = Object.values(baseline).reduce((sum, n) => sum + n, 0);
const resolved = Object.values(consumed).reduce((sum, n) => sum + n, 0);
console.log(`i18n guardrail: ${files.length} fichiers TSX vérifiés, aucun nouvel écart (${known - resolved} écart(s) connus en baseline).`);
if (resolved > 0) console.log(`${resolved} écart(s) de la baseline sont résolus : relancer avec --update-baseline pour la réduire.`);
