# WhatsApp Web

Plugin para 7DeCA 1.5.0 o posterior.

## Qué hace

- **«Enviar por WhatsApp»** en el detalle de cada envío emitido: manda el **PDF oficial** del DeCA o eCMR (nombre `DECA-2026-00125.pdf`) al conductor, desde el número de la empresa.
- Propone el teléfono del conductor del envío; se puede corregir o escribir otro. Mensaje editable con plantilla ({nombre_conductor}, {referencia}, {origen}, {destino}, {fecha}…).
- Puede enviar también la hoja de servicio (plugin «Hoja de servicio»).
- Historial por documento y estados reales: *Enviado* (aceptado por WhatsApp), *Entregado* (si el teléfono lo confirma), *Error* o *Sesión desconectada*. Reenvío si falla.

## A tener en cuenta

- **Separado del WhatsApp de recuperación de contraseñas**: sesión, configuración y estado propios; no usa ni modifica el puente `WHATSAPP_API`. Si uno falla, el otro sigue funcionando.
- Vinculación con el QR de WhatsApp Web desde la página *WhatsApp* (administradores); se ve el número conectado y se puede desconectar y volver a vincular. No se piden contraseñas.
- No envía borradores ni anulados, ni nada automáticamente. Usa [Baileys](https://github.com/WhiskeySockets/Baileys) (MIT), no la API de pago de WhatsApp Business: no es oficial, puede dejar de funcionar si WhatsApp cambia su web y la sesión puede tener que volver a vincularse.
