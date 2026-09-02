// Incrusta el ícono de Costea POS en el .exe sin necesitar Wine.
// electron-builder normalmente usa rcedit (Windows) a través de Wine; aquí
// editamos los recursos del ejecutable directamente con resedit (JavaScript puro).
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  // Se valida la carpeta que realmente se entregará, después de que
  // electron-builder aplique sus filtros. Así nunca se publica un portable
  // cuyo sello mencione archivos que el paquete final haya eliminado.
  const webAppPath = path.join(context.appOutDir, "resources", "web-app");
  const stampPath = path.join(webAppPath, "sello-caja.json");
  if (!fs.existsSync(stampPath))
    throw new Error(`El paquete final no contiene el sello de la interfaz: ${stampPath}`);
  const stamp = JSON.parse(fs.readFileSync(stampPath, "utf8"));
  const missing = (stamp.modulos || []).filter(
    (modulePath) => !fs.existsSync(path.join(webAppPath, "server", ...modulePath.split("/"))),
  );
  if (missing.length > 0)
    throw new Error(
      `El paquete final perdió ${missing.length} archivos del motor local: ${missing.slice(0, 5).join(", ")}`,
    );
  if (stamp.version !== context.packager.appInfo.version)
    throw new Error(
      `La interfaz integrada es ${stamp.version} y el ejecutable es ${context.packager.appInfo.version}.`,
    );
  console.log(`  • paquete final verificado: ${stamp.modulos.length} módulos de la interfaz local`);

  const ResEdit = require("resedit");
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const icoPath = path.join(__dirname, "icon.ico");
  if (!fs.existsSync(exePath) || !fs.existsSync(icoPath)) return;

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);

  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    icon.icons.map((i) => i.data),
  );

  const version = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (version) {
    const v = context.packager.appInfo.version.split(".").map(Number);
    version.setFileVersion(v[0] || 0, v[1] || 0, v[2] || 0, 0);
    version.setProductVersion(v[0] || 0, v[1] || 0, v[2] || 0, 0);
    version.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        ProductName: "Costea POS Caja",
        FileDescription: "Costea POS Caja",
        CompanyName: "Costea Pro",
        LegalCopyright: `Costea Pro ${new Date().getFullYear()}`,
      },
    );
    version.outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • ícono Costea POS incrustado en ${exeName}`);
};
