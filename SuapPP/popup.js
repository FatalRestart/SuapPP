document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('dados-boletim');
    const inputPresenca = document.getElementById('pct-presenca');
    
    // Recupera a última meta salva pelo usuário ou define 75% como padrão
    const metaSalva = localStorage.getItem('suap_meta_presenca') || '75';
    inputPresenca.value = metaSalva;

    let dadosMaterias = []; // Armazena os dados localmente para recalcular rápido em tempo real

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('suap.ifsp.edu.br/edu/aluno/')) {
        container.innerHTML = '<p class="info-msg">Por favor, abra a página do seu Boletim no SUAP para ativar a extensão.</p>';
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extrairDadosBoletim
    }, (results) => {
        if (!results || !results[0] || !results[0].result) {
            container.innerHTML = '<p class="info-msg">Não foi possível ler o boletim. Certifique-se de que a tabela está visível.</p>';
            return;
        }

        dadosMaterias = results[0].result;
        renderizarCalculos();
    });

    inputPresenca.addEventListener('input', () => {
        localStorage.setItem('suap_meta_presenca', inputPresenca.value);
        renderizarCalculos();
    });

    function renderizarCalculos() {
        if (dadosMaterias.length === 0) return;
        
        container.innerHTML = ''; 
        const minPresenca = parseFloat(inputPresenca.value) || 75;
        const maxFaltaPct = (100 - minPresenca) / 100;

        dadosMaterias.forEach(materia => {
            // Cálculo do limite de faltas baseado na meta do usuário
            const maxFaltas = Math.floor(materia.totalAulas * maxFaltaPct);
            const faltasRestantes = maxFaltas - materia.faltasAtuais;

            // Cenário de Projeção: Se o aluno faltar TODAS as próximas aulas do semestre
            // Aulas frequentadas até hoje = dadas - faltas atuais
            const aulasFrequentadas = materia.aulasCumpridas - materia.faltasAtuais;
            const presencaProjetada = materia.totalAulas > 0 
                ? ((aulasFrequentadas / materia.totalAulas) * 100).toFixed(1) 
                : 0;

            const card = document.createElement('div');
            card.className = 'card';

            // Define estilo do status atual de faltas
            let statusClass = 'safe';
            let msgFaltas = `Você ainda pode faltar <strong>${faltasRestantes}</strong> aulas.`;

            if (faltasRestantes < 0) {
                statusClass = 'danger';
                msgFaltas = `Reprovado! Excedeu o limite dessa meta por ${Math.abs(faltasRestantes)} faltas.`;
            } else if (faltasRestantes === 0) {
                statusClass = 'warning';
                msgFaltas = `No limite estrito! Você não pode mais faltar nenhuma aula.`;
            } else if (faltasRestantes <= 4) {
                statusClass = 'warning';
                msgFaltas = `Atenção! Restam apenas <strong>${faltasRestantes}</strong> faltas toleradas.`;
            }

            // Define estilo da barra de projeção "Faltar tudo"
            const projSucesso = parseFloat(presencaProjetada) >= minPresenca;
            const projClass = projSucesso ? 'safe' : 'danger';
            const msgProjecao = projSucesso 
                ? `Fica com <span class="${projClass}"><strong>${presencaProjetada}%</strong></span> (Aprovado)` 
                : `Fica com <span class="${projClass}"><strong>${presencaProjetada}%</strong></span> (Reprova por falta)`;

            card.innerHTML = `
                <h4>${materia.nome}</h4>
                <p>Aulas do Semestre: <strong>${materia.totalAulas}</strong> | Dadas até aqui: ${materia.aulasCumpridas}</p>
                <p>Faltas computadas: <strong>${materia.faltasAtuais}</strong> / Limite de ${maxFaltas}</p>
                <p class="status ${statusClass}">${msgFaltas}</p>
                
                <div class="projection-zone">
                    <span class="projection-title">Se você faltar todas as próximas aulas:</span>
                    <p style="margin-top: 4px; margin-bottom: 0;">Sua presença final: ${msgProjecao}</p>
                </div>
            `;
            container.appendChild(card);
        });
    }
});

function extrairDadosBoletim() {
    const tabela = document.getElementById('tabela_boletim');
    if (!tabela) return null;

    const linhas = tabela.querySelectorAll('tbody tr');
    const dados = [];

    linhas.forEach(linha => {
        const colunas = linha.querySelectorAll('td');
        if (colunas.length < 8) return; 

        const nomeMateria = colunas[1].innerText.replace(/\s+/g, ' ').trim();
        
        // C. H. Aulas (Coluna 3)
        const textoAulas = colunas[3].innerText;
        const totalAulas = parseInt(textoAulas.replace(/\D/g, ''), 10) || 0;

        // T. de Aulas Cumpridas (Coluna 4)
        const textoCumpridas = colunas[4].innerText.trim();
        const aulasCumpridas = parseInt(textoCumpridas, 10) || 0;

        // T. Faltas (Coluna 5)
        const textoFaltas = colunas[5].innerText.trim();
        const faltasAtuais = parseInt(textoFaltas, 10) || 0;

        if (totalAulas > 0) {
            dados.push({
                nome: nomeMateria,
                totalAulas: totalAulas,
                aulasCumpridas: aulasCumpridas,
                faltasAtuais: faltasAtuais
            });
        }
    });

    return dados;
}