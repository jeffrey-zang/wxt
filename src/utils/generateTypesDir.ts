import { createUnimport } from 'unimport';
import { Entrypoint, InternalConfig } from '../types';
import fs from 'fs-extra';
import { relative, resolve } from 'path';
import { getEntrypointBundlePath } from './entrypoints';
import { getUnimportOptions } from './auto-imports';
import { getGlobals } from './globals';

/**
 * Generate and write all the files inside the `InternalConfig.typesDir` directory.
 */
export async function generateTypesDir(
  entrypoints: Entrypoint[],
  config: InternalConfig,
): Promise<void> {
  await fs.ensureDir(config.typesDir);

  const references: string[] = [];
  references.push(await writeImportsDeclarationFile(config));
  references.push(await writePathsDeclarationFile(entrypoints, config));
  references.push(await writeGlobalsDeclarationFile(config));

  const mainReference = await writeMainDeclarationFile(references, config);
  await writeTsConfigFile(mainReference, config);
}

async function writeImportsDeclarationFile(
  config: InternalConfig,
): Promise<string> {
  const filePath = resolve(config.typesDir, 'imports.d.ts');
  const unimport = createUnimport(getUnimportOptions(config));

  // Load project imports into unimport memory so they are output via generateTypeDeclarations
  await unimport.scanImportsFromDir(undefined, { cwd: config.srcDir });

  await fs.writeFile(
    filePath,
    ['// Generated by exvite', await unimport.generateTypeDeclarations()].join(
      '\n',
    ) + '\n',
  );

  return filePath;
}

async function writePathsDeclarationFile(
  entrypoints: Entrypoint[],
  config: InternalConfig,
): Promise<string> {
  const filePath = resolve(config.typesDir, 'paths.d.ts');

  await fs.writeFile(
    filePath,
    [
      '// Generated by exvite',
      'type EntrypointPath =',
      ...entrypoints
        .map((entry) => {
          const path = getEntrypointBundlePath(
            entry,
            config.outDir,
            entry.inputPath.endsWith('.html') ? '.html' : '.js',
          );
          return `  | "/${path}"`;
        })
        .sort(),
    ].join('\n') + '\n',
  );

  return filePath;
}

async function writeGlobalsDeclarationFile(
  config: InternalConfig,
): Promise<string> {
  const filePath = resolve(config.typesDir, 'globals.d.ts');
  const globals = getGlobals(config);
  await fs.writeFile(
    filePath,
    [
      '// Generated by exvite',
      'export {}',
      'declare global {',
      ...globals.map((global) => `  const ${global.name}: ${global.type};`),
      '}',
    ].join('\n') + '\n',
    'utf-8',
  );
  return filePath;
}

async function writeMainDeclarationFile(
  references: string[],
  config: InternalConfig,
): Promise<string> {
  const dir = config.exviteDir;
  const filePath = resolve(dir, 'exvite.d.ts');
  await fs.writeFile(
    filePath,
    [
      '// Generated by exvite',
      ...references.map(
        (ref) => `/// <reference types="./${relative(dir, ref)}" />`,
      ),
    ].join('\n') + '\n',
  );
  return filePath;
}

async function writeTsConfigFile(
  mainReference: string,
  config: InternalConfig,
) {
  const dir = config.exviteDir;
  await fs.writeFile(
    resolve(dir, 'tsconfig.json'),
    `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,

    /* Type Checking */
    "strict": true,

    /* Completeness */
    "skipLibCheck": true
  },
  "include": [
    "${relative(dir, config.root)}/**/*",
    "./${relative(dir, mainReference)}"
  ],
  "exclude": ["${relative(dir, config.outBaseDir)}"]
}`,
  );
}
