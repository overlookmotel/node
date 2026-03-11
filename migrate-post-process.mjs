/*
Steps to benchmark ESLint vs Oxlint in this repo:

1. `npm ci` in root of repo.

2. `npm ci` in `tools/eslint` directory.

3. Patch `node_modules/eslint-plugin-jsdoc/src/buildForbidRuleDefinition.js` line 90:

```diff
+ delete propertyDescriptors.options.get;
+ delete propertyDescriptors.options.set;
```

4. Run this script: `node --run migrate`

5. Test ESlint vs Oxlint
  - `time node --run eslint`
  - `time node --run oxlint`
*/

import { globSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join as pathJoin } from "node:path";

const OXLINT_CONFIG_FILENAME = "oxlintrc.json";
const NODE_CORE_FILENAME = "node-core.cjs";
const LINTED_FILES_GLOB = "{benchmark,doc,lib,test,tools}/**/*.{js,ts,mjs,cjs}";

const configPath = pathJoin(import.meta.dirname, OXLINT_CONFIG_FILENAME);
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const jsPluginNames = new Set();
const eslintJsRuleNames = new Set();
const jsdocJsRuleNames = new Set();

processConfig(config, jsPluginNames, eslintJsRuleNames, jsdocJsRuleNames);

const { overrides } = config;
if (overrides) {
  for (const override of overrides) {
    processConfig(override, jsPluginNames, eslintJsRuleNames, jsdocJsRuleNames);
  }
}

writeFileSync(configPath, JSON.stringify(config, null, 2));

for (let path of globSync(LINTED_FILES_GLOB, { cwd: import.meta.dirname })) {
  path = pathJoin(import.meta.dirname, path);
  if (!statSync(path).isFile()) continue;
  convertDisableComments(path, eslintJsRuleNames, jsdocJsRuleNames);
}

console.log();
if (jsPluginNames.size === 0) {
  console.log("JS plugins used: (none)");
} else {
  console.log("JS plugins used:");
  for (const jsPluginName of [...jsPluginNames].sort()) {
    console.log(`- ${jsPluginName}`);
  }
}

console.log();
if (eslintJsRuleNames.size === 0) {
  console.log("ESLint rules converted to JS plugin: (none)");
} else {
  console.log("ESLint rules converted to JS plugin:");
  for (const ruleName of [...eslintJsRuleNames].sort()) {
    console.log(`- ${ruleName}`);
  }
}

console.log();
if (jsdocJsRuleNames.size === 0) {
  console.log("JSDoc rules converted to JS plugin: (none)");
} else {
  console.log("JSDoc rules converted to JS plugin:");
  for (const ruleName of [...jsdocJsRuleNames].sort()) {
    console.log(`- ${ruleName}`);
  }
}

function processConfig(config, jsPluginNames, eslintJsRuleNames, jsdocJsRuleNames) {
  const { jsPlugins, rules } = config;

  if (jsPlugins) {
    for (let i = 0; i < jsPlugins.length; i++) {
      const jsPlugin = jsPlugins[i];

      let name;
      if (typeof jsPlugin === "string") {
        name = jsPlugin;
        if (jsPlugin === "eslint-plugin-node-core") {
          name = "node-core";
          jsPlugins[i] = { name, specifier: `./${NODE_CORE_FILENAME}` };
        } else if (jsPlugin === "@stylistic/eslint-plugin-js") {
          name = "@stylistic/eslint-plugin";
          jsPlugins[i] = { name: "@stylistic/js", specifier: name };
        }
      }

      jsPluginNames.add(name);
    }
  }

  if (rules) {
    const newRules = {};

    for (let [ruleName, options] of Object.entries(rules)) {
      if (ruleName.startsWith("eslint-js/")) {
        eslintJsRuleNames.add(ruleName.slice("eslint-js/".length));
      } else if (ruleName.startsWith("jsdoc-js/")) {
        jsdocJsRuleNames.add(ruleName.slice("jsdoc-js/".length));
      } else if (ruleName === "capitalized-comments") {
        if (options[2]?.line?.ignorePattern === ".{0,20}$|[a-z]+ ?[0-9A-Z_.(/=:[#-]|std|http|ssh|ftp") {
          options[2].line.ignorePattern = ".{0,20}$|[a-z]+ ?[0-9A-Z_.(/=:\\[#-]|std|http|ssh|ftp";
        }
      }

      newRules[ruleName] = options;
    }

    config.rules = newRules;
  }
}

function convertDisableComments(path, eslintJsRuleNames, jsdocJsRuleNames) {
  let code = readFileSync(path, 'utf8');

  code = code.replace(
    /(\/\/[ \t]*eslint-(?:disable|enable)(?:(?:-next)?-line)?[ \t]+)(.*?)(\n|$)/g,
    (_, prefix, content, suffix) => {
      const converted = convertDisableComment(content, eslintJsRuleNames, jsdocJsRuleNames);
      return `${prefix}${converted}${suffix}`;
    }
  );
  code = code.replace(
    /(\/\*\s*eslint-(?:disable|enable)(?:(?:-next)?-line)?[ \t]+)(.*?)\*\//g,
    (_, prefix, content) => {
      const converted = convertDisableComment(content, eslintJsRuleNames, jsdocJsRuleNames);
      return `${prefix}${converted}*/`;
    }
  );

  writeFileSync(path, code);
}

function convertDisableComment(content, eslintJsRuleNames, jsdocJsRuleNames) {
  return content.split(",").map(part => {
    let [, prefix, ruleName, suffix] = part.match(/^(\s*)(.*?)(\s*)$/);

    if (eslintJsRuleNames.has(ruleName)) {
      ruleName = `eslint-js/${ruleName}`;
    } else if (ruleName.startsWith("jsdoc/")) {
      const shortRuleName = ruleName.slice("jsdoc/".length);
      if (jsdocJsRuleNames.has(shortRuleName)) ruleName = `jsdoc-js/${shortRuleName}`;
    } else if (ruleName.startsWith("@stylistic/js/")) {
      // ruleName = `@stylistic/${ruleName.slice("@stylistic/js/".length)}`;
    }

    return `${prefix}${ruleName}${suffix}`;
  }).join(",");
}
