import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const raiz = process.cwd();
const salida = path.join(raiz, ".output");
const destino = path.join(raiz, "desktop", "web-app");

await rm(salida, { recursive: true, force: true });
await rm(destino, { recursive: true, force: true });


await new Promise((resolve, reject) => {
  const esWindows = process.platform === "win32";
  // En Windows los .cmd (npx.cmd) exigen shell; sin esto Node lanza "spawn EINVAL" (-4071).
  const comando = esWindows ? "npx.cmd" : "npx";
  const proceso = spawn(comando, ["vite", "build"], {
    cwd: raiz,
    shell: esWindows,
    stdio: "inherit",
    env: (() => {
      const entorno = { ...process.env, DESKTOP_BUILD: "1" };
      // El preset de la nube se fuerza dentro del entorno gestionado; la caja necesita Node.
      delete entorno["LOVABLE_SANDBOX"];
      delete entorno["DEV_SERVER__PROJECT_PATH"];
      return entorno;
    })(),
  });
  proceso.once("error", reject);
  proceso.once("exit", (codigo) => (codigo === 0 ? resolve() : reject(new Error(`La compilación terminó con código ${codigo}`))));
});

await mkdir(path.dirname(destino), { recursive: true });
await cp(salida, destino, { recursive: true });

await verificarIntegridad(path.join(destino, "server"));
await verificarDependenciasTrazadas(path.join(destino, "server"));
await sellarPaquete(path.join(destino, "server"));
console.log(`Interfaz integrada en ${path.relative(raiz, destino)}`);

/**
 * Sella el paquete con la versión de la caja y la lista de módulos del servidor.
 * Así el programa puede avisar, antes de abrir la venta, si la carpeta que se
 * está ejecutando quedó incompleta o pertenece a una versión anterior.
 */
async function sellarPaquete(carpetaServidor) {
  const pkg = JSON.parse(await readFile(path.join(raiz, "desktop", "package.json"), "utf8"));
  const modulos = [];
  const recorrer = async (dir) => {
    const entradas = await readdir(dir, { withFileTypes: true });
    for (const e of entradas) {
      const completa = path.join(dir, e.name);
      if (e.isDirectory()) await recorrer(completa);
      else if (e.name.endsWith(".mjs") || e.name.endsWith(".js"))
        modulos.push(path.relative(carpetaServidor, completa).split(path.sep).join("/"));
    }
  };
  await recorrer(carpetaServidor);
  const sello = {
    version: pkg.version,
    generado: new Date().toISOString(),
    modulos: modulos.sort(),
  };
  await writeFile(path.join(destino, "sello-caja.json"), JSON.stringify(sello, null, 2), "utf8");
  console.log(`Paquete sellado como versión ${pkg.version} con ${modulos.length} módulos.`);
}


/**
 * Nitro declara aquí las dependencias que dejó fuera de sus módulos agrupados.
 * Deben existir físicamente porque el servidor local las resuelve al arrancar.
 */
async function verificarDependenciasTrazadas(carpetaServidor) {
  const rutaPackage = path.join(carpetaServidor, "package.json");
  const pkg = JSON.parse(await readFile(rutaPackage, "utf8"));
  const dependencias = Object.keys(pkg.dependencies || {});
  const faltantes = [];

  for (const nombre of dependencias) {
    const rutaDependencia = path.join(carpetaServidor, "node_modules", ...nombre.split("/"));
    const existe = await stat(rutaDependencia).then(
      (info) => info.isDirectory(),
      () => false,
    );
    if (!existe) faltantes.push(nombre);
  }

  if (faltantes.length > 0)
    throw new Error(`Faltan dependencias trazadas del motor local: ${faltantes.join(", ")}`);
  console.log(`Dependencias trazadas verificadas: ${dependencias.length}.`);
}


/**
 * Impide entregar una caja rota: si un módulo del servidor local importa un
 * archivo que no está en el paquete, la pantalla de venta responde error 500.
 */
async function verificarIntegridad(carpetaServidor) {
  const faltantes = [];
  let revisados = 0;

  const recorrer = async (dir) => {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        await recorrer(completa);
        continue;
      }
      if (!entrada.name.endsWith(".mjs") && !entrada.name.endsWith(".js")) continue;
      revisados += 1;
      const contenido = await readFile(completa, "utf8");
      const referencias = new Set(
        [...contenido.matchAll(/from\s*["'](\.\.?\/[^"']+\.m?js)["']/g)].map((m) => m[1]),
      );
      for (const ref of referencias) {
        const objetivo = path.resolve(path.dirname(completa), ref);
        const existe = await stat(objetivo).then(
          () => true,
          () => false,
        );
        if (!existe) faltantes.push(`${path.relative(raiz, completa)} → ${ref}`);
      }
    }
  };

  await recorrer(carpetaServidor);

  if (faltantes.length > 0) {
    console.error("Paquete incompleto: faltan archivos que el servidor local necesita:");
    for (const f of faltantes) console.error(`  · ${f}`);
    throw new Error("La interfaz integrada quedó incompleta; no se puede empaquetar la caja.");
  }
  console.log(`Integridad verificada: ${revisados} módulos del servidor local sin referencias rotas.`);
}