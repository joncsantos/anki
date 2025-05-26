// public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const addCardForm = document.getElementById('add-card-form');
    const addCardMessage = document.getElementById('add-card-message');
    const loadCardsBtn = document.getElementById('load-cards-btn');
    const reviewMessage = document.getElementById('review-message');
    const cardFrontContent = document.getElementById('card-front-content');
    const cardBackContent = document.getElementById('card-back-content');
    const showBackBtn = document.getElementById('show-back-btn');
    const reviewControls = document.getElementById('review-controls');
    const currentCardDisplay = document.getElementById('current-card'); // O contêiner visual do card

    let cardsToReview = [];
    let currentCardIndex = 0;

    // --- Funções Auxiliares ---
    function showMessage(element, message, type = 'success') {
        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block'; // Garante que a mensagem seja visível
        // Opcional: Esconder a mensagem após alguns segundos
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    function resetCardDisplay() {
        cardFrontContent.textContent = 'Nenhum card para revisar.';
        cardBackContent.textContent = '';
        cardBackContent.classList.add('hidden'); // Esconde o verso
        showBackBtn.style.display = 'none'; // Esconde o botão "Mostrar Verso"
        reviewControls.classList.add('hidden'); // Esconde os controles de revisão
        currentCardDisplay.style.backgroundColor = '#fff'; // Reseta a cor de fundo do card
    }

    function displayCurrentCard() {
        if (cardsToReview.length === 0) {
            resetCardDisplay();
            showMessage(reviewMessage, 'Não há cards para revisar no momento.', 'info');
            return;
        }

        const card = cardsToReview[currentCardIndex];
        cardFrontContent.textContent = card.front;
        cardBackContent.textContent = card.back;
        cardBackContent.classList.add('hidden'); // Garante que o verso esteja escondido ao mostrar um novo card
        showBackBtn.style.display = 'block'; // Mostra o botão "Mostrar Verso"
        reviewControls.classList.add('hidden'); // Garante que os controles estejam escondidos
        reviewMessage.style.display = 'none'; // Esconde mensagens de revisão anteriores
        currentCardDisplay.style.backgroundColor = '#fff'; // Reseta a cor de fundo do card
    }

    // --- Lógica de Adição de Cards ---
    addCardForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Impede o recarregamento da página
        const front = document.getElementById('front').value.trim();
        const back = document.getElementById('back').value.trim();

        if (!front || !back) {
            showMessage(addCardMessage, 'Por favor, preencha a frente e o verso do card.', 'error');
            return;
        }

        try {
            const response = await fetch('/api/cards', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ front, back }),
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(addCardMessage, 'Card adicionado com sucesso!', 'success');
                addCardForm.reset(); // Limpa o formulário
                document.getElementById('front').focus(); // Volta o foco para a frente do card
            } else {
                showMessage(addCardMessage, `Erro: ${data.error || 'Não foi possível adicionar o card.'}`, 'error');
            }
        } catch (error) {
            console.error('Erro ao adicionar card:', error);
            showMessage(addCardMessage, 'Erro de conexão. Verifique o servidor.', 'error');
        }
    });

    // --- Lógica de Revisão de Cards ---
    loadCardsBtn.addEventListener('click', async () => {
        reviewMessage.style.display = 'none'; // Limpa mensagens anteriores
        resetCardDisplay(); // Reseta a exibição do card antes de carregar
        try {
            const response = await fetch('/api/cards/review');
            const data = await response.json();

            if (response.ok) {
                cardsToReview = data;
                currentCardIndex = 0; // Sempre começa do primeiro card da nova lista
                if (cardsToReview.length > 0) {
                    displayCurrentCard();
                } else {
                    showMessage(reviewMessage, 'Parabéns! Não há cards para revisar hoje. Adicione mais!', 'success');
                }
            } else {
                showMessage(reviewMessage, `Erro: ${data.error || 'Não foi possível carregar os cards.'}`, 'error');
            }
        } catch (error) {
            console.error('Erro ao carregar cards:', error);
            showMessage(reviewMessage, 'Erro de conexão ao carregar cards. Verifique o servidor.', 'error');
        }
    });

    showBackBtn.addEventListener('click', () => {
        cardBackContent.classList.remove('hidden'); // Mostra o verso
        showBackBtn.style.display = 'none'; // Esconde o botão "Mostrar Verso"
        reviewControls.classList.remove('hidden'); // Mostra os controles de revisão
    });

    reviewControls.addEventListener('click', async (e) => {
        // Verifica se o clique foi em um botão dentro dos controles de revisão
        if (e.target.tagName === 'BUTTON' && e.target.dataset.quality !== undefined) {
            const quality = parseInt(e.target.dataset.quality);
            const card = cardsToReview[currentCardIndex];

            // Feedback visual rápido da qualidade
            const qualityColors = {
                0: '#dc3545', // Esqueci (Vermelho)
                1: '#fd7e14', // Muito difícil (Laranja)
                2: '#ffc107', // Difícil (Amarelo)
                3: '#28a745', // Bom (Verde)
                4: '#20c997', // Muito bom (Verde claro)
                5: '#007bff'  // Fácil (Azul)
            };
            currentCardDisplay.style.backgroundColor = qualityColors[quality];


            try {
                const response = await fetch(`/api/cards/${card.id}/review`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ quality }),
                });

                const data = await response.json();

                if (response.ok) {
                    // Remove o card revisado da lista local (não incrementa o index)
                    cardsToReview.splice(currentCardIndex, 1);

                    // Avança para o próximo card ou exibe mensagem de conclusão
                    if (cardsToReview.length > 0) {
                        // Um pequeno atraso para o usuário ver a cor de feedback
                        setTimeout(() => {
                            displayCurrentCard();
                        }, 300);
                    } else {
                        // Um pequeno atraso antes de resetar e mostrar a mensagem final
                        setTimeout(() => {
                            resetCardDisplay();
                            showMessage(reviewMessage, 'Você revisou todos os cards por agora! Bom trabalho.', 'success');
                        }, 300);
                    }

                } else {
                    showMessage(reviewMessage, `Erro ao atualizar card: ${data.error}`, 'error');
                    // Se houver erro, podemos querer resetar a cor e permitir tentar novamente
                    currentCardDisplay.style.backgroundColor = '#fff';
                }
            } catch (error) {
                console.error('Erro ao enviar revisão:', error);
                showMessage(reviewMessage, 'Erro de conexão ao enviar revisão. Tente novamente.', 'error');
                currentCardDisplay.style.backgroundColor = '#fff';
            }
        }
    });

    // --- Inicialização ---
    resetCardDisplay(); // Garante que o display do card esteja limpo ao carregar a página
});