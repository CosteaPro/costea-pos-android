import React from 'react'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  negocio?: string
  cliente?: string
  numero?: string
  fecha?: string
  total?: string
  autorizacion?: string
  claveAcceso?: string
  rideUrl?: string
  xmlUrl?: string
}

const Email = ({
  negocio = 'Costea POS',
  cliente,
  numero = '',
  fecha = '',
  total = '',
  autorizacion = '',
  claveAcceso = '',
  rideUrl = '',
  xmlUrl = '',
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>{`Su factura electrónica ${numero} fue autorizada por el SRI`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Factura electrónica autorizada</Heading>
        <Text style={text}>
          {cliente ? `Estimado/a ${cliente}:` : 'Estimado cliente:'} su comprobante emitido por{' '}
          <strong>{negocio}</strong> fue autorizado por el Servicio de Rentas Internas.
        </Text>

        <Section style={card}>
          <Text style={row}><strong>Factura Nº:</strong> {numero}</Text>
          <Text style={row}><strong>Fecha de emisión:</strong> {fecha}</Text>
          <Text style={row}><strong>Valor total:</strong> $ {total}</Text>
          <Text style={row}><strong>Autorización SRI:</strong></Text>
          <Text style={mono}>{autorizacion}</Text>
          <Text style={row}><strong>Clave de acceso (49):</strong></Text>
          <Text style={mono}>{claveAcceso}</Text>
        </Section>

        <Text style={text}>Descargue sus documentos oficiales:</Text>
        <Button style={btn} href={rideUrl}>Ver / descargar PDF (RIDE)</Button>
        <Text style={{ ...text, marginTop: '12px' }}>
          <a href={xmlUrl} style={link}>Descargar XML autorizado</a>
        </Text>

        <Hr style={hr} />
        <Text style={small}>
          El PDF se abre en su navegador; use la opción de imprimir para guardarlo como archivo PDF.
          Conserve el XML: es el documento con validez tributaria.
        </Text>
        <Text style={small}>{negocio}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Factura electrónica ${d['numero'] ?? ''} autorizada por el SRI`,
  displayName: 'Factura autorizada (RIDE + XML)',
  previewData: {
    negocio: 'Restaurante Costea',
    cliente: 'María Pérez',
    numero: '001-001-000000123',
    fecha: '11/08/2026 14:05',
    total: '24,50',
    autorizacion: '1108202601179...001',
    claveAcceso: '1108202601179123456700110010010000001231234567819',
    rideUrl: 'https://costea-pos-master.lovable.app/api/public/comprobante/1108202601179123456700110010010000001231234567819',
    xmlUrl: 'https://costea-pos-master.lovable.app/api/public/comprobante/1108202601179123456700110010010000001231234567819?formato=xml',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '20px', color: '#1f2937', margin: '0 0 12px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '22px', margin: '0 0 12px' }
const card = {
  backgroundColor: '#f4f6f8',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 16px',
}
const row = { fontSize: '13px', color: '#374151', margin: '2px 0' }
const mono = { fontSize: '12px', color: '#111827', fontFamily: 'Courier New, monospace', margin: '0 0 6px', wordBreak: 'break-all' as const }
const btn = {
  backgroundColor: '#e85d3a',
  color: '#ffffff',
  borderRadius: '8px',
  padding: '12px 22px',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
const link = { color: '#e85d3a', fontSize: '14px' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const small = { fontSize: '12px', color: '#6b7280', margin: '0 0 6px' }

export default Email
