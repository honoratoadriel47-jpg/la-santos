// ============================================================================
//  LA SANTOS — CONFIGURAÇÃO INICIAL
//  Esta é a configuração de fábrica. Depois do primeiro acesso, tudo é editado
//  pelo painel (/admin) e fica salvo no banco. Edite aqui apenas se quiser
//  mudar o ponto de partida de uma instalação nova.
//
//  Itens marcados com  ⚠ PLACEHOLDER  ainda não foram informados pela
//  barbearia e precisam ser preenchidos no painel antes de divulgar o site.
// ============================================================================

const svc = (id, name, category, reais, durationMin) => ({
  id, name, category, priceCents: Math.round(reais * 100), durationMin, active: true,
});

export const CATEGORIES = [
  { id: 'cortes', label: 'Cortes' },
  { id: 'combos', label: 'Combos' },
  { id: 'barba', label: 'Barba e detalhes' },
  { id: 'quimica', label: 'Coloração' },
];

// Serviços, valores e durações informados pela LA SANTOS.
export const DEFAULT_SERVICES = [
  svc('barba', 'Barba', 'barba', 25, 15),
  svc('barba-completa-pigmentada', 'Barba completa pigmentada', 'barba', 45, 20),
  svc('bigode', 'Bigode', 'barba', 3, 3),
  svc('cavanhaque', 'Cavanhaque', 'barba', 5, 3),
  svc('corte-nevou', 'Corte + Nevou', 'combos', 140, 60),
  svc('corte-barba-sobrancelha', 'Corte de Cabelo + Barba + Sobrancelha', 'combos', 75, 45),
  svc('corte-barba-sobrancelha-pigmentacao', 'Corte de Cabelo + Barba + Sobrancelha + Pigmentação', 'combos', 95, 50),
  svc('corte-cavanhaque', 'Corte de Cabelo + Cavanhaque', 'combos', 50, 30),
  svc('corte-pigmentacao', 'Corte de Cabelo + Pigmentação', 'combos', 65, 40),
  svc('corte-pigmentacao-sobrancelha', 'Corte de Cabelo + Pigmentação + Sobrancelha', 'combos', 70, 40),
  svc('corte-pente-unico', 'Corte de Cabelo com Pente Único', 'cortes', 25, 15),
  svc('corte-infantil', 'Corte de Cabelo Infantil', 'cortes', 50, 30),
  svc('corte-maquina', 'Corte de Cabelo na Máquina', 'cortes', 40, 30),
  svc('corte-maquina-barba', 'Corte de Cabelo na Máquina + Barba', 'combos', 65, 40),
  svc('corte-maquina-sobrancelha', 'Corte de Cabelo na Máquina + Sobrancelha', 'combos', 45, 30),
  svc('corte-maquina-tesoura', 'Corte de Cabelo na Máquina e Tesoura', 'cortes', 45, 30),
  svc('corte-maquina-tesoura-sobrancelha', 'Corte de Cabelo na Máquina e Tesoura + Sobrancelha', 'combos', 50, 30),
  svc('corte-tesoura', 'Corte de Cabelo na Tesoura', 'cortes', 45, 20),
  svc('corte-tesoura-barba', 'Corte de Cabelo na Tesoura + Barba', 'combos', 70, 45),
  svc('luzes', 'Luzes', 'quimica', 120, 60),
  svc('pezinho', 'Pézinho', 'barba', 15, 5),
  svc('pigmentacao', 'Pigmentação', 'quimica', 20, 10),
  svc('reflexo', 'Reflexo', 'quimica', 140, 60),
  svc('sobrancelha-navalha', 'Sobrancelha (Navalha)', 'barba', 5, 3),
];

const day = (open, start = '09:00', end = '19:00') => ({ open, start, end, breakStart: '', breakEnd: '' });

export function defaultConfig() {
  return {
    version: 1,
    business: {
      name: 'LA SANTOS',
      tagline: 'Barbearia',
      instagram: 'la_santosbarbearia',
      address: 'R. Miguel Couto, 471 - Palmital, Linhares - ES, 29906-820',
      mapsUrl: '',        // opcional; se vazio, o link do Google Maps é gerado pelo endereço
      whatsapp: '27995125793',
    },
    timezone: 'America/Sao_Paulo',
    booking: {
      slotStepMin: 15,     // intervalo entre horários oferecidos
      minLeadMin: 60,      // antecedência mínima para agendar
      maxDaysAhead: 30,    // até quantos dias à frente o cliente pode agendar
      bufferMin: 0,        // folga após cada atendimento
    },
    // ⚠ PLACEHOLDER — horário de funcionamento ainda não informado.
    // Índice 0 = domingo … 6 = sábado. Ajuste no painel em "Horários".
    hoursConfirmed: false,
    hours: [
      day(false), day(false), day(true), day(true), day(true), day(true), day(true, '08:00', '17:00'),
    ],
    categories: CATEGORIES,
    services: DEFAULT_SERVICES,
    // Nenhum profissional cadastrado: a agenda funciona como uma agenda única
    // da barbearia. Cadastre a equipe no painel para liberar a escolha.
    professionals: [],
    blocks: [],
  };
}
