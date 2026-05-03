// server.js - Con estadoPizarra: false por defecto

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const salas = new Map();

function generarId() {
    return crypto.randomBytes(4).toString('hex');
}

function crearSlideVacio() {
    return {
        image: null,
        strokes: [],
        bgColor: '#ffffff',
        texts: [
            { content: "", visible: true, label: "MSN_1" },
            { content: "", visible: true, label: "MSN_2" },
            { content: "", visible: true, label: "MSN_3" }
        ]
    };
}

function enviarListaEspectadores(sala) {
    if (!sala.maestro || sala.maestro.readyState !== WebSocket.OPEN) return;
    
    const lista = Array.from(sala.espectadores.entries()).map(([ws, data]) => ({
        id: data.id,
        nombre: data.nombre
    }));
    
    sala.maestro.send(JSON.stringify({
        tipo: 'lista_espectadores',
        data: lista
    }));
}

wss.on('connection', (ws) => {
    console.log('🟢 Cliente conectado');
    let salaId = null;
    let rol = null;
    let espectadorId = null;
    let espectadorNombre = null;

    ws.on('message', (data) => {
        const isAudio = typeof data !== 'string' && !(data instanceof Buffer && data.toString().startsWith('{'));
        
        if (isAudio) {
            const sala = salas.get(salaId);
            if (sala && rol === 'maestro') {
                sala.espectadores.forEach((_, es) => {
                    if (es !== ws && es.readyState === WebSocket.OPEN) {
                        es.send(data);
                    }
                });
            }
            return;
        }
        
        try {
            const msg = JSON.parse(data.toString());
            
            if (msg.tipo === 'identificar') {
                rol = msg.rol;
                console.log(`🔑 Cliente identificado como: ${rol}`);
                return;
            }
            
            if (msg.tipo === 'crear_sala') {
                salaId = generarId();
                rol = 'maestro';
                salas.set(salaId, {
                    maestro: ws,
                    espectadores: new Map(),
                    slides: [crearSlideVacio()],
                    currentSlideIndex: 0,
                    estadoPizarra: false  // ← Por defecto OFF
                });
                ws.send(JSON.stringify({ tipo: 'sala_creada', salaId }));
                console.log(`✅ Sala creada: ${salaId}`);
                return;
            }

            if (msg.tipo === 'unirse_sala') {
                const sala = salas.get(msg.salaId);
                if (!sala) {
                    ws.send(JSON.stringify({ tipo: 'error', mensaje: 'Sala no existe' }));
                    return;
                }
                salaId = msg.salaId;
                rol = 'espectador';
                espectadorId = generarId();
                espectadorNombre = msg.nombre || `Espectador_${espectadorId.substring(0, 4)}`;
                
                sala.espectadores.set(ws, {
                    id: espectadorId,
                    nombre: espectadorNombre
                });
                
                ws.send(JSON.stringify({
                    tipo: 'full_state',
                    data: {
                        slides: sala.slides,
                        currentIndex: sala.currentSlideIndex,
                        pizarraVisible: sala.estadoPizarra  // ← Enviar estado actual
                    }
                }));
                
                enviarListaEspectadores(sala);
                console.log(`👁️ Espectador "${espectadorNombre}" unido a sala: ${salaId}`);
                return;
            }

            if (msg.tipo === 'accion') {
                const sala = salas.get(salaId);
                if (!sala) return;

                const { accion, data } = msg;

                if (accion === 'draw') {
                    const slide = sala.slides[sala.currentSlideIndex];
                    if (slide) slide.strokes.push(data.stroke);
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'draw', data }));
                        }
                    });
                }
                else if (accion === 'reset') {
                    const slide = sala.slides[sala.currentSlideIndex];
                    if (slide) slide.strokes = [];
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'reset' }));
                        }
                    });
                }
                else if (accion === 'full_state') {
                    if (data.slides) sala.slides = data.slides;
                    if (data.currentIndex !== undefined) sala.currentSlideIndex = data.currentIndex;
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'full_state', data }));
                        }
                    });
                }
                else if (accion === 'slide_change') {
                    if (data.index !== undefined) sala.currentSlideIndex = data.index;
                    if (data.slides) sala.slides = data.slides;
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'slide_change', data }));
                        }
                    });
                }
                else if (accion === 'text_change') {
                    const slide = sala.slides[sala.currentSlideIndex];
                    if (slide && slide.texts[data.textboxIndex]) {
                        if (data.content !== undefined) slide.texts[data.textboxIndex].content = data.content;
                        if (data.isVisible !== undefined) slide.texts[data.textboxIndex].visible = data.isVisible;
                    }
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'text_change', data }));
                        }
                    });
                }
                else if (accion === 'bg_color') {
                    const slide = sala.slides[sala.currentSlideIndex];
                    if (slide) slide.bgColor = data.color;
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'bg_color', data }));
                        }
                    });
                }
                else if (accion === 'image_upload') {
                    const slide = sala.slides[sala.currentSlideIndex];
                    if (slide) slide.image = data.dataURL;
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({ type: 'image_upload', data }));
                        }
                    });
                }
                else if (accion === 'toggle_pizarra') {
                    sala.estadoPizarra = data.visible;
                    sala.espectadores.forEach((_, es) => {
                        if (es.readyState === WebSocket.OPEN) {
                            es.send(JSON.stringify({
                                tipo: 'accion',
                                accion: 'toggle_pizarra',
                                data: { visible: sala.estadoPizarra }
                            }));
                        }
                    });
                    console.log(`🔄 Toggle pizarra: ${sala.estadoPizarra ? 'ON' : 'OFF'}`);
                }
            }
        } catch(e) {
            console.error('Error:', e);
        }
    });

    ws.on('close', () => {
        if (salaId && rol === 'maestro') {
            salas.delete(salaId);
            console.log(`🗑️ Sala ${salaId} eliminada`);
        } else if (salaId && rol === 'espectador') {
            const sala = salas.get(salaId);
            if (sala) {
                sala.espectadores.delete(ws);
                enviarListaEspectadores(sala);
                console.log(`🔴 Espectador "${espectadorNombre}" desconectado`);
            }
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
    console.log(`   Estado pizarra por defecto: OFF`);
});