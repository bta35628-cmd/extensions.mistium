#!/usr/bin/env node
// Builds featured/Rotur.js from src/rotur/extension.js plus an embedded copy
// of rotur-sdk installed from npm. Run: npm run build:rotur
//
// The output is a single self-contained IIFE with no runtime fetches or
// imports, so the hosted file works exactly like the other extensions.

import { buildSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const entry = path.join(root, "src", "rotur", "extension.js");
const outFile = path.join(root, "featured", "Rotur.js");

const sdkPackagePath = path.join(root, "node_modules", "rotur-sdk", "package.json");
const sdkPackage = JSON.parse(fs.readFileSync(sdkPackagePath, "utf8"));

const result = buildSync({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  write: false,
  banner: { js: "" },
});

if (result.errors.length > 0) {
  console.error(result.errors);
  process.exit(1);
}

const bundle = result.outputFiles[0].text;
const header = `// Name: Rotur.js
// Author: Mistium
// Description: Utilise rotur in your projects
//
// GENERATED FILE - DO NOT EDIT.
// Source: src/rotur/extension.js (with src/rotur/helpers.js, src/rotur/getinfo.js)
// Built: ${new Date().toISOString()} by scripts/build-rotur-extension.mjs
// Embedded SDK: rotur-sdk@${sdkPackage.version} from npm (bundled, no runtime fetch)
//
// License: MPL-2.0
// This Source Code is subject to the terms of the Mozilla Public License, v2.0,
// If a copy of the MPL was not distributed with this file,
// Then you can obtain one at https://mozilla.org/MPL/2.0/
`;

fs.writeFileSync(outFile, header + "\n" + bundle);
console.log(`Built featured/Rotur.js with rotur-sdk@${sdkPackage.version}`);
