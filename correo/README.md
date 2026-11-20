# Envío por correo

Plugin para Gestor DeCA 1.5.0 o posterior.

## Qué hace

- **«Enviar por correo»** en el detalle de cada envío: PDF oficial adjunto y, opcionalmente, el enlace de consulta pública y la hoja de servicio.
- Propone el correo del conductor y del cliente o transportista; se pueden elegir varios y añadir otros. Asunto y mensaje editables con plantilla y variables.
- Historial por documento y reenvío.

## A tener en cuenta

- Cuenta SMTP de la empresa o de su proveedor (servidor, puerto, STARTTLS o SSL/TLS, usuario y contraseña o contraseña de aplicación, remitente y responder a), con **correo de prueba**. La contraseña se guarda cifrada y no se muestra en la interfaz, los registros ni la auditoría.
- «Aceptado por el servidor» no significa entregado ni leído; si el servidor rechaza alguna dirección, se indica. Errores claros de autenticación, conexión o rechazo.
- No envía borradores ni anulados. El límite de envíos depende de la cuenta SMTP.
