/**
 * Firma XAdES-BES del comprobante electrónico con el certificado .p12 del contribuyente.
 * Implementación en JavaScript puro (node-forge) para el runtime de servidor.
 */
import forge from "node-forge";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const ETSI = "http://uri.etsi.org/01903/v1.3.2#";

const sha1B64 = (text: string) => {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(text));
  return forge.util.encode64(md.digest().getBytes());
};

const rnd = (max: number) => Math.floor(Math.random() * max) + 1;

/** Nombre del emisor en formato RFC2253 inverso (como lo espera el SRI). */
function issuerName(cert: forge.pki.Certificate): string {
  return cert.issuer.attributes
    .map((a) => `${a.shortName ?? a.name}=${a.value as string}`)
    .reverse()
    .join(",");
}

export type SignedXml = { xml: string };

export function signXmlXades(
  p12Der: Uint8Array,
  password: string,
  xml: string,
  signingInstant: Date,
): SignedXml {
  let binary = "";
  for (let i = 0; i < p12Der.length; i++) binary += String.fromCharCode(p12Der[i] as number);

  const p12Asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const privateKey = keyBags[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  // El certificado de firma es el que corresponde a la clave privada (no la CA raíz).
  const cert =
    (certBags.map((b) => b.cert).find((c) => c && c.publicKey && privateKey &&
      (c.publicKey as forge.pki.rsa.PublicKey).n.toString(16) ===
        (privateKey.n as forge.jsbn.BigInteger).toString(16)) as forge.pki.Certificate | undefined) ??
    (certBags[0]?.cert as forge.pki.Certificate | undefined);

  if (!privateKey || !cert)
    throw new Error("No se pudo leer el certificado o la clave privada del archivo .p12 (¿contraseña incorrecta?)");

  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certB64 = forge.util.encode64(certDer);
  const certDigest = forge.util.encode64(forge.md.sha1.create().update(certDer).digest().getBytes());

  const modulus = forge.util.encode64(forge.util.hexToBytes(publicKey.n.toString(16).padStart(
    Math.ceil(publicKey.n.toString(16).length / 2) * 2,
    "0",
  )));
  const exponent = forge.util.encode64(forge.util.hexToBytes(
    publicKey.e.toString(16).length % 2 ? `0${publicKey.e.toString(16)}` : publicKey.e.toString(16),
  ));

  const sigNum = rnd(999999);
  const sigId = `Signature${sigNum}`;
  const sPropsId = `${sigId}-SignedProperties${rnd(999999)}`;
  const certId = `Certificate${rnd(999999)}`;
  const refId = `Reference-ID-${rnd(999999)}`;
  const signedInfoId = `${sigId}-SignedInfo${rnd(999999)}`;
  const sigValueId = `SignatureValue${rnd(999999)}`;
  const objectId = `${sigId}-Object${rnd(999999)}`;

  if (!Number.isFinite(signingInstant.getTime())) throw new Error("La fecha de firma del dispositivo no es válida");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(signingInstant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = value.hour === "24" ? "00" : value.hour;
  const signingTime = `${value.year}-${value.month}-${value.day}T${hour}:${value.minute}:${value.second}-05:00`;

  // ── Propiedades firmadas (con los namespaces heredados, como exige la canonicalización)
  const signedPropsInner =
    `<etsi:SignedSignatureProperties>` +
    `<etsi:SigningTime>${signingTime}</etsi:SigningTime>` +
    `<etsi:SigningCertificate>` +
    `<etsi:Cert>` +
    `<etsi:CertDigest>` +
    `<ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${certDigest}</ds:DigestValue>` +
    `</etsi:CertDigest>` +
    `<etsi:IssuerSerial>` +
    `<ds:X509IssuerName>${issuerName(cert)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${new forge.jsbn.BigInteger(cert.serialNumber, 16).toString(10)}</ds:X509SerialNumber>` +
    `</etsi:IssuerSerial>` +
    `</etsi:Cert>` +
    `</etsi:SigningCertificate>` +
    `</etsi:SignedSignatureProperties>` +
    `<etsi:SignedDataObjectProperties>` +
    `<etsi:DataObjectFormat ObjectReference="#${refId}">` +
    `<etsi:Description>contenido comprobante</etsi:Description>` +
    `<etsi:MimeType>text/xml</etsi:MimeType>` +
    `</etsi:DataObjectFormat>` +
    `</etsi:SignedDataObjectProperties>`;

  const signedPropsC14n =
    `<etsi:SignedProperties xmlns:ds="${DS}" xmlns:etsi="${ETSI}" Id="${sPropsId}">${signedPropsInner}</etsi:SignedProperties>`;
  const signedPropsInDoc = `<etsi:SignedProperties Id="${sPropsId}">${signedPropsInner}</etsi:SignedProperties>`;
  const signedPropsDigest = sha1B64(signedPropsC14n);

  // ── KeyInfo
  const keyInfoInner =
    `<ds:X509Data>` +
    `<ds:X509Certificate>${certB64}</ds:X509Certificate>` +
    `</ds:X509Data>` +
    `<ds:KeyValue>` +
    `<ds:RSAKeyValue>` +
    `<ds:Modulus>${modulus}</ds:Modulus>` +
    `<ds:Exponent>${exponent}</ds:Exponent>` +
    `</ds:RSAKeyValue>` +
    `</ds:KeyValue>`;
  const keyInfoC14n = `<ds:KeyInfo xmlns:ds="${DS}" xmlns:etsi="${ETSI}" Id="${certId}">${keyInfoInner}</ds:KeyInfo>`;
  const keyInfoInDoc = `<ds:KeyInfo Id="${certId}">${keyInfoInner}</ds:KeyInfo>`;
  const keyInfoDigest = sha1B64(keyInfoC14n);

  // ── Documento (transformada enveloped: se firma el comprobante sin la firma)
  const docWithoutHeader = xml.replace(/<\?xml[^?]*\?>\s*/, "");
  const docDigest = sha1B64(docWithoutHeader);

  const signedInfoInner =
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${DS}rsa-sha1"></ds:SignatureMethod>` +
    `<ds:Reference Id="SignedPropertiesID${rnd(999999)}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${sPropsId}">` +
    `<ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference URI="#${certId}">` +
    `<ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Id="${refId}" URI="#comprobante">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="${DS}enveloped-signature"></ds:Transform>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${DS}sha1"></ds:DigestMethod>` +
    `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
    `</ds:Reference>`;

  const signedInfoC14n = `<ds:SignedInfo xmlns:ds="${DS}" xmlns:etsi="${ETSI}" Id="${signedInfoId}">${signedInfoInner}</ds:SignedInfo>`;
  const signedInfoInDoc = `<ds:SignedInfo Id="${signedInfoId}">${signedInfoInner}</ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(signedInfoC14n));
  const signatureValue = forge.util.encode64(privateKey.sign(md));

  const signature =
    `<ds:Signature xmlns:ds="${DS}" xmlns:etsi="${ETSI}" Id="${sigId}">` +
    signedInfoInDoc +
    `<ds:SignatureValue Id="${sigValueId}">${signatureValue}</ds:SignatureValue>` +
    keyInfoInDoc +
    `<ds:Object Id="${objectId}">` +
    `<etsi:QualifyingProperties Target="#${sigId}">` +
    signedPropsInDoc +

    `</etsi:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`;

  let signedXml = xml.replace(/<\/factura>\s*$/, `${signature}</factura>`);
  if (!signedXml.startsWith('<?xml')) {
    signedXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + signedXml;
  }
  return { xml: signedXml };
}
