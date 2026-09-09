// =======================================================
// УНИВЕРСАЛЬНЫЙ ДВИЖОК: КОРЗИНА, КУХНЯ, КАТЕГОРИИ, REALTIME
// =======================================================

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const haptic = () => {
  try { if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); } catch(e){}
};

// 1. Определение пользователя и роли
const currentUserId = tg?.initDataUnsafe?.user?.id || CONFIG.adminIds[0];
const adminList = (CONFIG.adminIds || []).map(String);
const staffList = (CONFIG.staffIds || []).map(String);

const isAdmin = adminList.includes(String(currentUserId));
const isStaff = isAdmin || staffList.includes(String(currentUserId));

// Состояние
let menuItems = [];
let addonsList = [];
let cart = [];
let myOrders = [];
let allOrders = [];
let activeCategory = "Все";
let currentOrderType = CONFIG.hasPickup ? 'pickup' : 'delivery';

// 2. Применение настроек бренда
function applyBrandSettings() {
  document.getElementById('brand-name').innerText = CONFIG.brandName;
  document.getElementById('brand-subtitle').innerText = CONFIG.brandSubtitle;
  document.getElementById('brand-logo').innerText = CONFIG.brandLogo;

  if (isStaff) document.getElementById('nav-btn-kitchen').classList.remove('hidden');
  if (isAdmin) document.getElementById('nav-btn-admin').classList.remove('hidden');

  renderCategories();
  renderOrderTypeButtons();
}

// 3. Рендер плашек категорий
function renderCategories() {
  const container = document.getElementById('categories-bar');
  if (!CONFIG.categories || CONFIG.categories.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = CONFIG.categories.map(cat => `
    <button type="button" onclick="setCategory('${cat}')" class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}">
      ${cat}
    </button>
  `).join('');
}

function setCategory(cat) {
  haptic();
  activeCategory = cat;
  renderCategories();
  renderMenu();
}

// 4. Кнопки «Доставка / Самовывоз»
function renderOrderTypeButtons() {
  const container = document.getElementById('order-type-buttons');
  let html = '';

  if (CONFIG.hasPickup) {
    html += `
      <button type="button" id="btn-type-pickup" onclick="setOrderType('pickup')" class="py-2.5 text-xs font-bold rounded-xl border transition-all ${currentOrderType === 'pickup' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'}">
        🏃‍♂️ Самовывоз
      </button>
    `;
  }
  if (CONFIG.hasDelivery) {
    html += `
      <button type="button" id="btn-type-delivery" onclick="setOrderType('delivery')" class="py-2.5 text-xs font-bold rounded-xl border transition-all ${currentOrderType === 'delivery' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200'}">
        🛵 Доставка
      </button>
    `;
  }

  container.innerHTML = html;
  updateOrderTypeUI();
}

function setOrderType(type) {
  haptic();
  currentOrderType = type;
  renderOrderTypeButtons();
  updateOrderTypeUI();
}

function updateOrderTypeUI() {
  const addrBlock = document.getElementById('address-block');
  const pickupBlock = document.getElementById('pickup-time-block');

  if (currentOrderType === 'delivery') {
    addrBlock.classList.remove('hidden');
    pickupBlock.classList.add('hidden');
  } else {
    addrBlock.classList.add('hidden');
    pickupBlock.classList.remove('hidden');
  }
}

// 5. Загрузка данных
async function loadData() {
  try {
    const { data: menu } = await supabaseClient.from('menu').select('*').eq('is_available', true);
    menuItems = menu || [];

    const { data: addons } = await supabaseClient.from('addons').select('*').eq('is_available', true);
    addonsList = addons || [];

    renderMenu();
    await loadOrders();
  } catch (err) {
    console.error('Ошибка загрузки:', err);
  }
}

// 6. Рендер каталога блюд
function renderMenu() {
  const container = document.getElementById('menu-container');
  
  // Фильтрация по категории (если у блюд в базе есть колонка category)
  const filtered = activeCategory === "Все" 
    ? menuItems 
    : menuItems.filter(i => (i.category || '').toLowerCase() === activeCategory.toLowerCase());

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 py-10">В этой категории пока ничего нет</p>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex gap-3 items-center">
      <img src="${item.image_url || 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=300'}" class="w-20 h-20 rounded-xl object-cover bg-slate-50 flex-shrink-0">
      <div class="flex-grow min-w-0">
        <h4 class="font-extrabold text-sm text-slate-900 truncate">${item.name}</h4>
        <p class="text-xs text-slate-400 line-clamp-1 mt-0.5">${item.description || ''}</p>
        <p class="text-sm font-black text-slate-900 mt-1">${item.price} ${CONFIG.currency}</p>
      </div>
      <button type="button" onclick="addToCart(${item.id})" class="bg-slate-100 active:scale-90 text-slate-900 font-extrabold px-3.5 py-2 rounded-xl text-xs transition-all">
        + В корзину
      </button>
    </div>
  `).join('');
}

// 7. Корзина
function addToCart(itemId) {
  haptic();
  cart.push({ id: itemId, quantity: 1, addons: [] });
  renderCart();
}

function updateQuantity(index, delta) {
  haptic();
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  renderCart();
}

function toggleAddon(cartIndex, addonId) {
  haptic();
  const idx = cart[cartIndex].addons.indexOf(addonId);
  if (idx === -1) cart[cartIndex].addons.push(addonId);
  else cart[cartIndex].addons.splice(idx, 1);
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, it) => {
    const prod = menuItems.find(m => m.id === it.id);
    let itemPrice = prod ? prod.price : 0;
    it.addons.forEach(aid => {
      const ad = addonsList.find(a => a.id === aid);
      if (ad) itemPrice += ad.price;
    });
    return sum + (itemPrice * it.quantity);
  }, 0);
}

function renderCart() {
  const drawer = document.getElementById('cart-drawer');
  const itemsContainer = document.getElementById('cart-items');
  const totalPriceEl = document.getElementById('cart-total-price');

  if (cart.length === 0) {
    drawer.classList.add('hidden');
    return;
  }

  drawer.classList.remove('hidden');
  totalPriceEl.innerText = `${getCartTotal()} ${CONFIG.currency}`;

  itemsContainer.innerHTML = cart.map((it, idx) => {
    const prod = menuItems.find(m => m.id === it.id);
    if (!prod) return '';

    return `
      <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100">
        <div class="flex justify-between items-center">
          <span class="font-bold text-xs text-slate-800">${prod.name}</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="updateQuantity(${idx}, -1)" class="w-6 h-6 bg-white rounded-lg font-black text-xs shadow-sm">-</button>
            <span class="text-xs font-bold">${it.quantity}</span>
            <button type="button" onclick="updateQuantity(${idx}, 1)" class="w-6 h-6 bg-white rounded-lg font-black text-xs shadow-sm">+</button>
          </div>
        </div>

        ${addonsList.length > 0 ? `
          <div class="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap gap-1.5">
            ${addonsList.map(ad => `
              <button type="button" onclick="toggleAddon(${idx}, ${ad.id})" class="text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${it.addons.includes(ad.id) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}">
                + ${ad.name} (${ad.price} ${CONFIG.currency})
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 8. Оформление заказа
async function submitOrder() {
  if (cart.length === 0) return;

  const phone = document.getElementById('order-phone').value.trim();
  const address = document.getElementById('order-address').value.trim();
  const time = document.getElementById('order-time').value;
  const payment = document.getElementById('order-payment').value;

  if (!phone) {
    alert('Пожалуйста, укажите номер телефона для связи!');
    return;
  }
  if (currentOrderType === 'delivery' && !address) {
    alert('Пожалуйста, укажите адрес доставки!');
    return;
  }

  const btn = document.getElementById('submit-order-btn');
  btn.innerText = 'Отправка...';
  btn.disabled = true;

  const orderNumber = Math.floor(100 + Math.random() * 900);
  const total = getCartTotal();

  const orderPayload = {
    order_number: orderNumber,
    items: cart.map(i => ({ id: i.id, quantity: i.quantity, addons: i.addons })),
    total: total,
    payment_method: payment,
    pickup_time: currentOrderType === 'pickup' ? parseInt(time) : null,
    status: 'pending',
    client_id: currentUserId.toString()
  };

  try {
    const { error } = await supabaseClient.from('orders').insert([orderPayload]);
    if (error) throw error;

    haptic();
    cart = [];
    renderCart();
    switchTab('orders');
    await loadOrders();

    // Уведомление владельцу в Telegram
    const typeTitle = currentOrderType === 'delivery' ? `🛵 Доставка (${address})` : `🏃‍♂️ Самовывоз (${time} мин)`;
    CONFIG.adminIds.forEach(adminId => {
      sendTelegramMessage(adminId, 
        `🔔 *НОВЫЙ ЗАКАЗ #${orderNumber}!* \n` +
        `📋 ${typeTitle}\n` +
        `📞 Тел: ${phone}\n` +
        `💰 Сумма: ${total} ${CONFIG.currency}`
      );
    });

  } catch (err) {
    alert('Ошибка оформления: ' + err.message);
  } finally {
    btn.innerText = 'Оформить заказ';
    btn.disabled = false;
  }
}

// 9. Вспомогательная функция сборки состава заказа
function buildOrderItemsHtml(items) {
  if (!items || !Array.isArray(items)) return '—';

  return items.map(it => {
    const prod = menuItems.find(m => m.id === it.id);
    const prodName = prod ? prod.name : 'Позиция';

    let addonsStr = '';
    if (it.addons && it.addons.length > 0) {
      const names = it.addons.map(aid => {
        const a = addonsList.find(x => x.id === aid);
        return a ? a.name : '';
      }).filter(Boolean).join(', ');
      if (names) addonsStr = `<div class="text-[11px] text-amber-600 font-semibold pl-2">➕ ${names}</div>`;
    }

    return `
      <div class="py-1">
        <span class="font-bold text-slate-800">${prodName}</span> × ${it.quantity}
        ${addonsStr}
      </div>
    `;
  }).join('');
}

// 10. Загрузка и показ заказов
async function loadOrders() {
  const { data: clientOrders } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('client_id', currentUserId.toString())
    .order('created_at', { ascending: false });
  myOrders = clientOrders || [];
  renderClientOrders();

  if (isStaff) {
    const { data: all } = await supabaseClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    allOrders = all || [];
    renderKitchenOrders();
    if (isAdmin) renderAdminStats();
  }
}

function renderClientOrders() {
  const container = document.getElementById('my-orders-list');
  if (myOrders.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 py-10">Активных заказов нет</p>`;
    return;
  }

  container.innerHTML = myOrders.map(o => {
    let badge = '<span class="bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-bold">⏳ Ожидает</span>';
    if (o.status === 'preparing') badge = '<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">🔥 Готовится</span>';
    if (o.status === 'ready') badge = '<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-bold">✅ Готов!</span>';
    if (o.status === 'completed') badge = '<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs font-bold">📦 Выдан</span>';

    return `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2">
        <div class="flex justify-between items-center border-b pb-2">
          <span class="font-extrabold text-sm text-slate-900">Заказ #${o.order_number}</span>
          ${badge}
        </div>
        <div class="text-xs text-slate-600 divide-y divide-slate-50">
          ${buildOrderItemsHtml(o.items)}
        </div>
        <div class="flex justify-between items-center pt-2 border-t border-slate-100">
          <span class="text-xs text-slate-400 font-medium">${o.payment_method}</span>
          <span class="text-sm font-black text-slate-900">${o.total} ${CONFIG.currency}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 11. КУХНЯ С ПОЛНЫМ СОСТАВОМ И СВЯЗЬЮ С КЛИЕНТОМ
function renderKitchenOrders() {
  const container = document.getElementById('kitchen-orders-list');
  const active = allOrders.filter(o => o.status !== 'completed');
  document.getElementById('active-orders-count').innerText = `${active.length} активных`;

  if (active.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 py-10">Заказов на кухне нет</p>`;
    return;
  }

  container.innerHTML = active.map(o => `
    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
      <div class="flex justify-between items-center border-b pb-2">
        <div>
          <span class="font-black text-base text-slate-900">Чек #${o.order_number}</span>
          <span class="text-xs block text-slate-400 font-semibold">${new Date(o.created_at).toLocaleTimeString().slice(0, 5)}</span>
        </div>
        <span class="text-xs font-black px-2 py-1 bg-slate-100 rounded-lg text-slate-700">
          ${o.pickup_time ? `🏃‍♂️ Самовывоз (${o.pickup_time} мин)` : `🛵 Доставка`}
        </span>
      </div>

      <!-- ПОЛНЫЙ СОСТАВ БЛЮД ДЛЯ ПОВАРА -->
      <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-800 divide-y divide-slate-200/60">
        ${buildOrderItemsHtml(o.items)}
      </div>

      <!-- Кнопки статусов -->
      <div class="grid grid-cols-3 gap-1.5">
        <button type="button" onclick="setOrderStatus(${o.id}, 'pending')" class="py-2 text-xs font-bold rounded-xl border ${o.status === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-600 border-slate-200'}">⏳ Ждет</button>
        <button type="button" onclick="setOrderStatus(${o.id}, 'preparing')" class="py-2 text-xs font-bold rounded-xl border ${o.status === 'preparing' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">🔥 Готовить</button>
        <button type="button" onclick="setOrderStatus(${o.id}, 'ready')" class="py-2 text-xs font-bold rounded-xl border ${o.status === 'ready' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">✅ Готов</button>
      </div>

      <button type="button" onclick="setOrderStatus(${o.id}, 'completed')" class="w-full bg-slate-900 text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-all">
        💰 Выдан и оплачен (${o.total} ${CONFIG.currency})
      </button>
    </div>
  `).join('');
}

async function setOrderStatus(orderId, newStatus) {
  haptic();
  const order = allOrders.find(o => o.id === orderId);

  await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
  await loadOrders();

  // Пуш клиенту в Telegram, когда заказ готов
  if (newStatus === 'ready' && order?.client_id) {
    sendTelegramMessage(order.client_id, `🎉 *Ваш заказ #${order.order_number} ГОТОВ!* Забирайте на выдаче.`);
  }
}

// 12. Касса для босса
function renderAdminStats() {
  const today = new Date().toDateString();
  const todayOrders = allOrders.filter(o => new Date(o.created_at).toDateString() === today);
  const revenue = todayOrders.reduce((sum, o) => sum + o.total, 0);

  document.getElementById('stat-revenue').innerText = `${revenue} ${CONFIG.currency}`;
  document.getElementById('stat-count').innerText = todayOrders.length;

  document.getElementById('admin-recent-orders').innerHTML = todayOrders.slice(0, 5).map(o => `
    <div class="flex justify-between py-1 border-b border-slate-50">
      <span>#${o.order_number} (${o.status})</span>
      <span class="font-bold">${o.total} ${CONFIG.currency}</span>
    </div>
  `).join('');
}

// 13. Realtime
function initRealtime() {
  supabaseClient
    .channel('orders-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
      await loadOrders();
    })
    .subscribe();
}

// 14. Навигация
function switchTab(tab) {
  haptic();
  ['menu', 'orders', 'kitchen', 'admin'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`nav-btn-${t}`);
    if (el) el.classList.add('hidden');
    if (btn) btn.classList.replace('text-slate-900', 'text-slate-400');
  });

  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.getElementById(`nav-btn-${tab}`).classList.replace('text-slate-400', 'text-slate-900');
}

// Отправка сообщений в Telegram API
async function sendTelegramMessage(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch(e){}
}

// СТАРТ СИСТЕМЫ
applyBrandSettings();
loadData();
initRealtime();