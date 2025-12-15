const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS atualizado para desenvolvimento
app.use(cors({
    origin: '*', // Permite todas as origens em desenvolvimento
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin']
}));

// Middleware para tratamento de pré-flight requests
app.options('*', cors());

// Middleware para permitir requisições de qualquer origem em desenvolvimento
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

app.use(express.json());

// Middleware de log para debug
app.use((req, res, next) => {
    console.log(`\n📥 ${req.method} ${req.url}`);
    console.log(`📍 Origem: ${req.headers.origin || 'Sem origem'}`);
    console.log(`📊 Body:`, req.body || 'Sem body');
    next();
});

// Rota de teste aprimorada
app.get('/api/health', (req, res) => {
    console.log('✅ Health check recebido de:', req.headers.origin);
    res.json({
        status: 'OK',
        message: 'Servidor funcionando!',
        apiKey: process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ Faltando',
        timestamp: new Date().toISOString(),
        cors: 'Configurado para todas origens (desenvolvimento)',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Rota GET simples para teste
app.get('/api/teste', (req, res) => {
    res.json({
        message: 'Backend funcionando!',
        cors: 'Configurado para todas origens',
        timestamp: new Date().toISOString(),
        teste: 'Esta é uma rota GET de teste'
    });
});

// Base de dados local para fallback
const DATASET_MEDICO = {
    'febre': {
        diagnostico: 'Infecção viral ou bacteriana',
        urgencia: 'MODERADA',
        especialista: 'Clínico Geral',
        recomendacoes: 'Repouso, hidratação, monitorar temperatura, usar antitérmico se necessário',
        aviso: 'Se febre acima de 39°C ou persistir por mais de 3 dias, consulte médico',
        sintomas_associados: ['calafrios', 'suores', 'dor no corpo']
    },
    'dor cabeça': {
        diagnostico: 'Cefaleia tensional ou enxaqueca',
        urgencia: 'NORMAL',
        especialista: 'Neurologista',
        recomendacoes: 'Descanso em ambiente escuro, analgésico, compressa fria na testa',
        aviso: 'Se dor intensa, súbita ou acompanhada de visão turva, procure atendimento urgente',
        sintomas_associados: ['enjoo', 'fotofobia', 'tontura']
    },
    'tosse': {
        diagnostico: 'Alergia, gripe ou bronquite',
        urgencia: 'NORMAL',
        especialista: 'Pneumologista',
        recomendacoes: 'Hidratação, mel, chá de limão, evitar mudanças bruscas de temperatura',
        aviso: 'Se tosse com sangue, falta de ar ou persistir por mais de 2 semanas, consulte médico',
        sintomas_associados: ['catarro', 'chiado no peito', 'dor de garganta']
    },
    'garganta': {
        diagnostico: 'Faringite ou amigdalite',
        urgencia: 'NORMAL',
        especialista: 'Otorrinolaringologista',
        recomendacoes: 'Gargarejo com água morna e sal, pastilhas, líquidos quentes',
        aviso: 'Se dificuldade para engolir, respirar ou febre alta, procure atendimento',
        sintomas_associados: ['dificuldade engolir', 'rouquidão', 'amígdalas inchadas']
    },
    'barriga': {
        diagnostico: 'Gastrite, gastroenterite ou cólica',
        urgencia: 'NORMAL',
        especialista: 'Gastroenterologista',
        recomendacoes: 'Dieta leve, hidratação, evitar alimentos gordurosos e condimentados',
        aviso: 'Se dor intensa, vômitos persistentes ou sangue nas fezes, procure urgente',
        sintomas_associados: ['náuseas', 'vômitos', 'diarreia', 'inchaço']
    }
};

// Função para gerar resposta a partir do dataset local
const gerarRespostaLocal = (sintomas) => {
    const lowerSintomas = sintomas.toLowerCase();
    let melhorMatch = null;

    for (const [key, data] of Object.entries(DATASET_MEDICO)) {
        if (lowerSintomas.includes(key)) {
            melhorMatch = { key, data };
            break;
        }
    }

    if (!melhorMatch) {
        return `Com base nos sintomas "${sintomas}", recomendo:\n\n**Possível Diagnóstico:** Avaliação clínica necessária\n**Urgência:** CONSULTA RECOMENDADA\n**Especialista Indicado:** Clínico Geral\n**Recomendações:** Descreva melhor os sintomas (intensidade, duração, fatores que pioram/melhoram)\n**Aviso:** Esta é apenas uma orientação preliminar. Consulte um médico profissional.`;
    }

    const { key, data } = melhorMatch;
    return `Análise para sintomas relacionados a "${key}":\n\n**Possível Diagnóstico:** ${data.diagnostico}\n**Urgência:** ${data.urgencia}\n**Especialista Indicado:** ${data.especialista}\n**Recomendações:** ${data.recomendacoes}\n**Aviso Importante:** ${data.aviso}\n\n⚠️ Esta é apenas uma orientação preliminar. Consulte um médico para diagnóstico preciso.`;
};

// Rota alternativa para testes (sem API externa)
app.post('/api/chat-teste', (req, res) => {
    console.log('📋 Usando rota de teste (sem API Gemini)');

    const { sintomas, idade, historico } = req.body;

    if (!sintomas || sintomas.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Sintomas são obrigatórios'
        });
    }

    const resposta = gerarRespostaLocal(sintomas);

    res.json({
        success: true,
        resposta: resposta,
        origem: 'Sistema local de análise',
        timestamp: new Date().toISOString(),
        nota: 'Resposta gerada pelo sistema local (sem API Gemini)'
    });
});

// Rota principal para chat médico com fallback automático
app.post('/api/chat-medico', async (req, res) => {
    console.log('📥 Recebida requisição de chat médico');
    console.log('📝 Sintomas:', req.body.sintomas);

    try {
        const { sintomas, idade, historico } = req.body;

        if (!sintomas || sintomas.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Sintomas são obrigatórios'
            });
        }

        // Verificar se API key existe e é válida
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === '') {
            console.log('⚠️ API Key não configurada, usando sistema local');
            const respostaLocal = gerarRespostaLocal(sintomas);

            return res.json({
                success: true,
                resposta: respostaLocal,
                origem: 'Sistema local (API Key não configurada)',
                timestamp: new Date().toISOString()
            });
        }

        // Se a API Key não começar com AIza, usar sistema local
        if (!process.env.GEMINI_API_KEY.startsWith('AIza')) {
            console.log('⚠️ Formato de API Key inválido, usando sistema local');
            const respostaLocal = gerarRespostaLocal(sintomas);

            return res.json({
                success: true,
                resposta: respostaLocal,
                origem: 'Sistema local (API Key inválida)',
                timestamp: new Date().toISOString()
            });
        }

        console.log('🔗 Tentando conectar à API Gemini...');

        // Preparar instrução para o Gemini
        const systemInstruction = `Você é um assistente médico especializado em pré-diagnóstico em Angola.
Analise estes sintomas: "${sintomas}"
${idade ? `Idade: ${idade}` : ''}
${historico ? `Histórico médico: ${historico}` : ''}

Caso o usuário tenta fornecer alguma informaçao que não seja sobre Saude fornaça a seguinte mensagem : "Dados Inavlidos. Por favor introduza os seus sintomas"

Forneça uma análise clara e útil com as seguintes seções:

**Possível Diagnóstico:** [Mencione 1-2 possibilidades mais comuns]
**Nível de Urgência:** [BAIXA/MÉDIA/ALTA]
**Especialista Indicado:** [Especialidade médica recomendada]
**Recomendações Imediatas:** [Liste 3-4 recomendações práticas]
**Quando Procurar Atendimento:** [Especificar situações de alerta]
**Aviso Importante:** "Esta é apenas uma orientação preliminar. Consulte um médico profissional para diagnóstico preciso."

Use linguagem clara, objectiva e empática. Responda em português de Portugal.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await axios.post(
            geminiUrl,
            {
                contents: [
                    {
                        parts: [{ text: systemInstruction }]
                    }
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 4096
                }
            },
            {
                timeout: 30000, // 30 segundos timeout
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('📊 Resposta da Gemini recebida (Status: ' + response.status + ')');
        // console.log('📦 Dados brutos:', JSON.stringify(response.data, null, 2)); // Descomente para debug total

        let resposta = 'Não consegui gerar uma análise específica. Por favor, descreva seus sintomas com mais detalhes.';

        const candidate = response.data?.candidates?.[0];
        const parts = candidate?.content?.parts;
        const text = parts?.[0]?.text;

        if (text) {
            resposta = text;
            console.log('✅ Resposta Gemini obtida com sucesso');
        } else if (response.data.error) {
            console.error('❌ Erro da API Gemini:', response.data.error);
            // Fallback para sistema local em caso de erro da API
            resposta = gerarRespostaLocal(sintomas) + '\n\n[Nota: Resposta gerada localmente devido a erro na API]';
        }

        res.json({
            success: true,
            resposta: resposta,
            timestamp: new Date().toISOString(),
            origem: 'API Gemini AI'
        });

    } catch (error) {
        console.error('❌ Erro no processamento:', error.message);
        console.error('📋 Detalhes:', error.response?.data || error.code);

        // Fallback automático para sistema local em caso de erro
        const { sintomas } = req.body;
        const respostaLocal = gerarRespostaLocal(sintomas || 'sintomas gerais');

        let detalhesErro = 'Erro na conexão com serviço externo';

        if (error.response?.status === 400) {
            detalhesErro = 'Requisição inválida para a API';
        } else if (error.response?.status === 403) {
            detalhesErro = 'Problema com autenticação da API';
        } else if (error.response?.status === 429) {
            detalhesErro = 'Limite de requisições excedido';
        } else if (error.code === 'ECONNABORTED') {
            detalhesErro = 'Tempo limite excedido';
        } else if (error.code === 'ENOTFOUND') {
            detalhesErro = 'Não foi possível conectar ao serviço';
        }

        // Retornar resposta local mesmo em caso de erro
        res.json({
            success: true,
            resposta: `${respostaLocal}\n\n[Nota: Sistema usando análise local devido a: ${detalhesErro}]`,
            timestamp: new Date().toISOString(),
            origem: 'Sistema local (fallback)',
            aviso: 'Resposta gerada pelo sistema interno devido a problemas na API externa'
        });
    }
});

// Rota para buscar locais médicos
app.post('/api/locais-proximos', async (req, res) => {
    console.log('📍 Buscando locais médicos próximos');

    try {
        const { lat, lon, radius = 5000 } = req.body;

        if (!lat || !lon) {
            return res.status(400).json({
                success: false,
                error: 'Coordenadas são obrigatórias'
            });
        }

        // Dados mock para desenvolvimento
        if (process.env.NODE_ENV === 'development' && (!lat || !lon)) {
            console.log('📋 Usando dados mock para locais médicos');

            const lugaresMock = [
                {
                    id: 1,
                    name: 'Hospital de São João',
                    amenity: 'hospital',
                    lat: 41.1789,
                    lon: -8.5981,
                    distanceKm: 1.2,
                    tags: {
                        name: 'Hospital de São João',
                        amenity: 'hospital',
                        'contact:phone': '+351 22 551 2100'
                    }
                },
                {
                    id: 2,
                    name: 'Farmácia Central',
                    amenity: 'pharmacy',
                    lat: 41.1495,
                    lon: -8.6108,
                    distanceKm: 0.8,
                    tags: {
                        name: 'Farmácia Central',
                        amenity: 'pharmacy',
                        opening_hours: '24/7'
                    }
                },
                {
                    id: 3,
                    name: 'Centro de Saúde de Cedofeita',
                    amenity: 'clinic',
                    lat: 41.1523,
                    lon: -8.6154,
                    distanceKm: 1.5,
                    tags: {
                        name: 'Centro de Saúde de Cedofeita',
                        amenity: 'clinic',
                        'contact:phone': '+351 22 208 4200'
                    }
                }
            ];

            return res.json({
                success: true,
                lugares: lugaresMock,
                total: lugaresMock.length,
                suaLocalizacao: { lat, lon },
                origem: 'Dados de desenvolvimento (mock)'
            });
        }

        const query = `
            [out:json][timeout:25];
            (
              node["amenity"~"hospital|pharmacy|clinic|doctors"](around:${radius},${lat},${lon});
              way["amenity"~"hospital|pharmacy|clinic|doctors"](around:${radius},${lat},${lon});
              relation["amenity"~"hospital|pharmacy|clinic|doctors"](around:${radius},${lat},${lon});
            );
            out center;
        `;

        console.log('🔍 Consultando Overpass API...');
        const overpassResponse = await axios.post(
            'https://overpass-api.de/api/interpreter',
            `data=${encodeURIComponent(query)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const lugares = overpassResponse.data.elements || [];
        console.log(`✅ Encontrados ${lugares.length} locais`);

        // Processar lugares encontrados
        const lugaresProcessados = lugares.map(el => {
            const latEl = el.lat || (el.center && el.center.lat);
            const lonEl = el.lon || (el.center && el.center.lon);

            return {
                id: el.id,
                name: (el.tags && el.tags.name) || 'Local médico',
                amenity: (el.tags && el.tags.amenity) || 'local',
                lat: latEl,
                lon: lonEl,
                distanceKm: latEl ? calcularDistancia(lat, lon, latEl, lonEl) : 999,
                tags: el.tags || {}
            };
        }).filter(r => r.lat && r.lon)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 15);

        res.json({
            success: true,
            lugares: lugaresProcessados,
            total: lugaresProcessados.length,
            suaLocalizacao: { lat, lon },
            origem: 'Overpass API'
        });

    } catch (error) {
        console.error('❌ Erro ao buscar locais:', error.message);

        // Fallback com dados mock
        const lugaresMock = [
            {
                id: 9991,
                name: 'Hospital Geral',
                amenity: 'hospital',
                lat: req.body.lat || 41.1579,
                lon: req.body.lon || -8.6291,
                distanceKm: 0.5,
                tags: { name: 'Hospital Geral', amenity: 'hospital' }
            },
            {
                id: 9992,
                name: 'Farmácia 24 Horas',
                amenity: 'pharmacy',
                lat: (req.body.lat || 41.1579) + 0.002,
                lon: (req.body.lon || -8.6291) + 0.002,
                distanceKm: 0.8,
                tags: { name: 'Farmácia 24 Horas', amenity: 'pharmacy' }
            }
        ];

        res.json({
            success: true,
            lugares: lugaresMock,
            total: lugaresMock.length,
            suaLocalizacao: { lat: req.body.lat, lon: req.body.lon },
            aviso: 'Dados de exemplo devido a erro na busca',
            origem: 'Sistema local (fallback)'
        });
    }
});

// Função auxiliar para calcular distância
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Rota de fallback para qualquer outra requisição
app.use('*', (req, res) => {
    console.log('❌ Rota não encontrada:', req.originalUrl);
    res.status(404).json({
        success: false,
        error: 'Rota não encontrada',
        rotasDisponiveis: [
            'GET /api/health',
            'GET /api/teste',
            'POST /api/chat-medico',
            'POST /api/chat-teste',
            'POST /api/locais-proximos'
        ],
        timestamp: new Date().toISOString()
    });
});

// Middleware de erro global
app.use((err, req, res, next) => {
    console.error('🔥 Erro global:', err.stack);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Contacte o administrador',
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`✅ Servidor rodando em: http://localhost:${PORT}`);
    console.log(`✅ Também acessível em: http://127.0.0.1:${PORT}`);
    console.log(`\n📌 Rotas disponíveis:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/teste`);
    console.log(`   POST /api/chat-medico`);
    console.log(`   POST /api/chat-teste`);
    console.log(`   POST /api/locais-proximos`);
    console.log(`\n🔑 API Key: ${process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ NÃO CONFIGURADA!'}`);
    console.log(`🌐 CORS: Configurado para todas origens (desenvolvimento)`);
    console.log(`📊 Dataset local: ${Object.keys(DATASET_MEDICO).length} sintomas pré-configurados`);
    console.log(`========================================\n`);
});

// Tratamento de erros no servidor
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Porta ${PORT} já está em uso!`);
        console.log('Soluções:');
        console.log('1. Mudar a porta no arquivo .env (PORT=3001)');
        console.log('2. Matar o processo na porta:');
        console.log('   Windows: netstat -ano | findstr :3000');
        console.log('   Mac/Linux: lsof -i :3000');
        console.log('   Ou reinicie o computador');
    } else {
        console.error('❌ Erro no servidor:', error.message);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Recebido SIGTERM, encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('👋 Recebido SIGINT (Ctrl+C), encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado com sucesso');
        process.exit(0);
    });
});

// Exportar app para testes
module.exports = app;