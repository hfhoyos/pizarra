// server.js - Actualizado con evento toggle_pizarra
// Añade este código al server.js existente

// Dentro de wss.on('connection', (ws) => { ... ws.on('message', (data) => { ...

// En la sección donde se procesan las acciones, agregar:

} else if (accion === 'toggle_pizarra') {
    // Reenviar toggle a todos los espectadores
    sala.espectadores.forEach((_, es) => {
        if (es !== ws && es.readyState === WebSocket.OPEN) {
            es.send(JSON.stringify({
                tipo: 'accion',
                accion: 'toggle_pizarra',
                data: { visible: datos.visible }
            }));
        }
    });
    console.log('🔄 Toggle pizarra reenviado a espectadores:', datos.visible);
}
