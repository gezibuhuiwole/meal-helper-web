const ROUTES = ["home", "planner", "meals"];
const CATEGORY_ORDER_BY_MEAL = {
  breakfast: ["主食", "小吃", "饮品", "主菜", "汤羹", "轻食碗/沙拉"],
  lunch: ["主菜", "主食", "小吃", "汤羹", "轻食碗/沙拉", "饮品"],
  dinner: ["主菜", "主食", "汤羹", "轻食碗/沙拉", "小吃", "饮品"]
};
const DIETARY_ORDER = ["all", "diet_meat", "diet_vegetarian", "diet_seafood", "diet_mixed"];
const DIETARY_LABEL_MAP = {
  all: "全部",
  diet_meat: "肉类",
  diet_vegetarian: "素食",
  diet_seafood: "海鲜",
  diet_mixed: "综合"
};
const MEAL_META = {
  breakfast: { icon: "晨", title: "早餐菜单", subtitle: "用轻盈主食、饮品和热食把今天温柔地打开。" },
  lunch: { icon: "午", title: "午餐菜单", subtitle: "把主菜、主食和汤羹搭配成一顿真正有满足感的正餐。" },
  dinner: { icon: "夜", title: "晚餐菜单", subtitle: "按今晚的节奏安排晚餐，从暖食到饮品都能自由组合。" }
};
const STORAGE_KEY = "meal-helper-web-state-v2";
const VISUAL_PALETTES = [
  { bg: "#6d8771", accent: "#f4d3c5", surface: "#fcfaf5", a: "#8fd06d", b: "#f2b54d", c: "#a94b54", d: "#f0e0a7" },
  { bg: "#6f8ca3", accent: "#f1d6c3", surface: "#fffaf6", a: "#94c66d", b: "#ef9c34", c: "#f2d674", d: "#9e5a61" },
  { bg: "#83956d", accent: "#f6dccf", surface: "#fffdf8", a: "#73c37d", b: "#ffb34c", c: "#d76757", d: "#e6d98d" },
  { bg: "#527e8b", accent: "#f7d5c8", surface: "#fffaf5", a: "#75d089", b: "#e8a13e", c: "#ca4f53", d: "#f1df92" },
  { bg: "#8a7b62", accent: "#efd3c1", surface: "#fffaf6", a: "#82c869", b: "#f2aa55", c: "#b84d5a", d: "#ebdc9b" }
];

const app = document.getElementById("app");

const state = {
  route: "home",
  activeMeals: [],
  currentMealKey: "",
  currentCategoryByMeal: {},
  currentDietaryByMeal: {},
  selectedIdsByMeal: {
    breakfast: [],
    lunch: [],
    dinner: []
  },
  toast: ""
};

let catalog = null;
let dishLookup = {};
let toastTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hashString(value) {
  return Array.from(String(value)).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function formatPrice(value) {
  return `¥${value}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    activeMeals: state.activeMeals,
    currentMealKey: state.currentMealKey,
    currentCategoryByMeal: state.currentCategoryByMeal,
    currentDietaryByMeal: state.currentDietaryByMeal,
    selectedIdsByMeal: state.selectedIdsByMeal
  }));
}

function restoreState() {
  if (!catalog) {
    return;
  }

  const fallbackMeals = catalog.mealPeriods.map((meal) => meal.key);
  state.activeMeals = [...fallbackMeals];
  state.currentMealKey = fallbackMeals[0] || "";

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.activeMeals) && parsed.activeMeals.length) {
      state.activeMeals = parsed.activeMeals.filter((mealKey) => fallbackMeals.includes(mealKey));
    }

    if (!state.activeMeals.length) {
      state.activeMeals = [...fallbackMeals];
    }

    if (parsed.currentMealKey && state.activeMeals.includes(parsed.currentMealKey)) {
      state.currentMealKey = parsed.currentMealKey;
    }

    state.currentCategoryByMeal = parsed.currentCategoryByMeal || {};
    state.currentDietaryByMeal = parsed.currentDietaryByMeal || {};
    const selectedByMeal = parsed.selectedIdsByMeal || {};
    state.selectedIdsByMeal = {
      breakfast: Array.isArray(selectedByMeal.breakfast) ? selectedByMeal.breakfast : [],
      lunch: Array.isArray(selectedByMeal.lunch) ? selectedByMeal.lunch : [],
      dinner: Array.isArray(selectedByMeal.dinner) ? selectedByMeal.dinner : []
    };
  } catch (error) {
    console.warn("Failed to restore state", error);
  }
}

function syncRoute() {
  const route = window.location.hash.replace("#", "");
  state.route = ROUTES.includes(route) ? route : "home";
}

function getSelectedIds(mealKey) {
  return state.selectedIdsByMeal[mealKey] || [];
}

function getUniqueDishes() {
  const seen = new Set();
  return Object.values(catalog.dishes).flat().filter((dish) => {
    if (seen.has(dish.id)) {
      return false;
    }
    seen.add(dish.id);
    return true;
  });
}

function getCategoryRank(mealKey, label) {
  const order = CATEGORY_ORDER_BY_MEAL[mealKey] || [];
  const index = order.indexOf(label);
  return index === -1 ? order.length + 1 : index;
}

function buildMealDishCards(mealKey) {
  const selectedSet = new Set(getSelectedIds(mealKey));

  return (catalog.dishes[mealKey] || []).map((dish) => ({
    ...dish,
    selected: selectedSet.has(dish.id),
    ingredientPreview: (dish.ingredients || []).slice(0, 3)
  }));
}

function buildCategoryState(mealKey, mealDishes) {
  const currentCategoryId = state.currentCategoryByMeal[mealKey];
  const categoryMap = mealDishes.reduce((result, dish) => {
    if (!result[dish.categoryId]) {
      result[dish.categoryId] = {
        id: dish.categoryId,
        label: dish.category || "其他",
        count: 0,
        selectedCount: 0
      };
    }

    result[dish.categoryId].count += 1;
    if (dish.selected) {
      result[dish.categoryId].selectedCount += 1;
    }

    return result;
  }, {});

  const categoryTabs = Object.values(categoryMap).sort((left, right) => {
    const rankDiff = getCategoryRank(mealKey, left.label) - getCategoryRank(mealKey, right.label);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.label.localeCompare(right.label, "zh-Hans-CN");
  });

  const fallbackCategoryId = categoryTabs.some((item) => item.id === currentCategoryId)
    ? currentCategoryId
    : (categoryTabs[0] ? categoryTabs[0].id : "");
  const currentCategory = categoryTabs.find((item) => item.id === fallbackCategoryId) || null;
  const categoryDishes = mealDishes.filter((dish) => dish.categoryId === fallbackCategoryId);

  return {
    categoryTabs,
    currentCategoryId: fallbackCategoryId,
    currentCategoryLabel: currentCategory ? currentCategory.label : "",
    categoryDishes
  };
}

function buildDietaryState(categoryDishes, mealKey) {
  const currentDietaryTypeId = state.currentDietaryByMeal[mealKey];
  const dietaryMap = categoryDishes.reduce((result, dish) => {
    if (!dish.dietaryTypeId) {
      return result;
    }

    if (!result[dish.dietaryTypeId]) {
      result[dish.dietaryTypeId] = {
        id: dish.dietaryTypeId,
        label: DIETARY_LABEL_MAP[dish.dietaryTypeId] || dish.dietaryType || "其他",
        count: 0
      };
    }

    result[dish.dietaryTypeId].count += 1;
    return result;
  }, {});

  const dietaryTabs = [{ id: "all", label: DIETARY_LABEL_MAP.all, count: categoryDishes.length }].concat(
    Object.values(dietaryMap).sort((left, right) => {
      const rankDiff = DIETARY_ORDER.indexOf(left.id) - DIETARY_ORDER.indexOf(right.id);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return right.count - left.count;
    })
  );

  const fallbackDietaryTypeId = dietaryTabs.some((item) => item.id === currentDietaryTypeId)
    ? currentDietaryTypeId
    : "all";
  const currentDietaryType = dietaryTabs.find((item) => item.id === fallbackDietaryTypeId) || dietaryTabs[0];
  const visibleDishes = fallbackDietaryTypeId === "all"
    ? categoryDishes
    : categoryDishes.filter((dish) => dish.dietaryTypeId === fallbackDietaryTypeId);

  return {
    dietaryTabs,
    currentDietaryTypeId: fallbackDietaryTypeId,
    currentDietaryTypeLabel: currentDietaryType ? currentDietaryType.label : DIETARY_LABEL_MAP.all,
    visibleDishes
  };
}

function buildSelectedDishes() {
  return catalog.mealPeriods.reduce((result, meal) => {
    if (!state.activeMeals.includes(meal.key)) {
      result[meal.key] = [];
      return result;
    }

    result[meal.key] = getSelectedIds(meal.key)
      .map((dishId) => dishLookup[dishId])
      .filter(Boolean);
    return result;
  }, {});
}

function buildIngredients(selectedDishes) {
  const counts = {};

  selectedDishes.forEach((dish) => {
    (dish.ingredients || []).forEach((ingredient) => {
      counts[ingredient] = (counts[ingredient] || 0) + 1;
    });
  });

  return Object.keys(counts)
    .map((name) => ({ name, count: counts[name] }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-Hans-CN"));
}

function summarizeSelection() {
  const selectedDishesByMeal = buildSelectedDishes();
  const allSelectedDishes = catalog.mealPeriods.reduce((result, meal) => result.concat(selectedDishesByMeal[meal.key] || []), []);
  const selectedIngredients = buildIngredients(allSelectedDishes);

  const totals = allSelectedDishes.reduce((result, dish) => {
    result.totalCalories += dish.calories || 0;
    result.totalPrice += dish.price || 0;
    result.selectedCount += 1;
    return result;
  }, { totalCalories: 0, totalPrice: 0, selectedCount: 0 });

  return {
    totalCalories: totals.totalCalories,
    totalPrice: totals.totalPrice,
    selectedCount: totals.selectedCount,
    selectedIngredients,
    selectedIngredientsPreview: selectedIngredients.slice(0, 8),
    selectedIngredientCount: selectedIngredients.length,
    selectedDishesByMeal,
    allSelectedDishes
  };
}

function buildMealTabs() {
  return catalog.mealPeriods.map((meal) => ({
    ...meal,
    ...MEAL_META[meal.key],
    enabled: state.activeMeals.includes(meal.key),
    selectedCount: getSelectedIds(meal.key).length
  }));
}

function buildViewModel() {
  const mealTabs = buildMealTabs();
  const fallbackMealKey = state.currentMealKey && state.activeMeals.includes(state.currentMealKey)
    ? state.currentMealKey
    : (state.activeMeals[0] || catalog.mealPeriods[0].key);
  const currentMeal = catalog.mealPeriods.find((meal) => meal.key === fallbackMealKey) || catalog.mealPeriods[0];
  const mealDishes = buildMealDishCards(currentMeal.key);
  const categoryState = buildCategoryState(currentMeal.key, mealDishes);
  const dietaryState = buildDietaryState(categoryState.categoryDishes, currentMeal.key);
  const summary = summarizeSelection();
  const activeMealLabels = mealTabs.filter((meal) => meal.enabled).map((meal) => meal.label);

  state.currentMealKey = currentMeal.key;
  state.currentCategoryByMeal[currentMeal.key] = categoryState.currentCategoryId;
  state.currentDietaryByMeal[currentMeal.key] = dietaryState.currentDietaryTypeId;

  return {
    mealTabs,
    categoryTabs: categoryState.categoryTabs,
    dietaryTabs: dietaryState.dietaryTabs,
    currentMealKey: currentMeal.key,
    currentMealLabel: currentMeal.label,
    currentMealTitle: MEAL_META[currentMeal.key].title,
    currentMealSubtitle: MEAL_META[currentMeal.key].subtitle,
    currentCategoryId: categoryState.currentCategoryId,
    currentCategoryLabel: categoryState.currentCategoryLabel,
    currentDietaryTypeId: dietaryState.currentDietaryTypeId,
    currentDietaryTypeLabel: dietaryState.currentDietaryTypeLabel,
    visibleDishes: dietaryState.visibleDishes,
    activeMealSummary: activeMealLabels.join(" · ") || "未选择餐次",
    totalCalories: summary.totalCalories,
    totalPrice: summary.totalPrice,
    selectedCount: summary.selectedCount,
    selectedIngredientsPreview: summary.selectedIngredientsPreview,
    selectedIngredientCount: summary.selectedIngredientCount,
    selectedDishesByMeal: summary.selectedDishesByMeal,
    allSelectedDishes: summary.allSelectedDishes
  };
}

function getPalette(dish, offset = 0) {
  const base = hashString(`${dish.id}-${dish.categoryId}-${offset}`) % VISUAL_PALETTES.length;
  return VISUAL_PALETTES[base];
}

function getDishBadge(dish) {
  if (dish.category === "汤羹") {
    return "暖食";
  }
  if (dish.category === "饮品") {
    return "饮品";
  }
  if (dish.dietaryTypeId === "diet_seafood") {
    return "海味";
  }
  if (dish.dietaryTypeId === "diet_vegetarian") {
    return "素选";
  }
  return dish.category;
}

function buildIngredientSummary(dish, count = 3) {
  const preview = (dish.ingredients || []).slice(0, count);
  if (!preview.length) {
    return "适合加入今天的餐食安排。";
  }
  const mealLabel = catalog.mealPeriods.find((meal) => meal.id === dish.defaultMealPeriodId)?.label || "今天";
  return `以${preview.join("、")}为主，适合安排在${mealLabel}。`;
}

function renderVisual(dish, variant = "card", customBadge = "") {
  const palette = getPalette(dish, variant.length);
  const noteHtml = (dish.ingredients || []).slice(0, 2).map((ingredient) => `<span class="visual-note">${escapeHtml(ingredient)}</span>`).join("");
  const badge = customBadge || getDishBadge(dish);

  return `
    <div class="visual-art visual-art--${variant}" style="--visual-bg:${palette.bg}; --visual-accent:${palette.accent}; --visual-surface:${palette.surface}; --visual-a:${palette.a}; --visual-b:${palette.b}; --visual-c:${palette.c}; --visual-d:${palette.d};">
      <div class="visual-accent-shape"></div>
      <div class="visual-shadow"></div>
      <div class="visual-plate">
        <span class="visual-item visual-item-a"></span>
        <span class="visual-item visual-item-b"></span>
        <span class="visual-item visual-item-c"></span>
        <span class="visual-item visual-item-d"></span>
      </div>
      <div class="visual-note-stack">${noteHtml}</div>
      <span class="visual-badge">${escapeHtml(badge)}</span>
    </div>
  `;
}

function buildShowcaseDishes() {
  const dishes = getUniqueDishes();
  const pick = (matcher, fallbackIndex) => dishes.find(matcher) || dishes[fallbackIndex] || dishes[0];

  return {
    hero: pick((dish) => dish.category === "轻食碗/沙拉" || dish.dietaryTypeId === "diet_vegetarian", 0),
    seasonal: pick((dish) => dish.category === "轻食碗/沙拉", 1),
    protein: pick((dish) => dish.dietaryTypeId === "diet_meat" && dish.category === "主菜", 2),
    sip: pick((dish) => dish.category === "饮品", 3),
    slow: pick((dish) => dish.category === "汤羹", 4),
    mosaic: dishes.slice(5, 9)
  };
}

function renderHeader(route) {
  const navItems = [
    { route: "home", label: "首页" },
    { route: "planner", label: "规划器" },
    { route: "meals", label: "我的菜单" }
  ];
  const summary = summarizeSelection();

  return `
    <header class="site-header">
      <div class="brand-block" data-action="route" data-route="home">
        <div class="brand-mark">今日饭单</div>
        <div class="brand-caption">中文餐食规划网页</div>
      </div>
      <nav class="top-nav">
        ${navItems.map((item) => `
          <button class="nav-link ${route === item.route ? "active" : ""}" data-action="route" data-route="${item.route}">${item.label}</button>
        `).join("")}
      </nav>
      <div class="header-actions">
        <div class="header-status">${summary.selectedCount ? `已安排 ${summary.selectedCount} 道菜` : "本地自动保存"}</div>
        <button class="header-cta" data-action="route" data-route="planner">开始规划</button>
      </div>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div>
        <div class="footer-brand">今日饭单</div>
        <div class="footer-copy">基于你的餐次节奏、菜品分类与预算，整理一份真正能用的中文饭单。</div>
      </div>
      <div class="footer-links">
        <button class="footer-link" data-action="route" data-route="home">首页</button>
        <button class="footer-link" data-action="route" data-route="planner">规划器</button>
        <button class="footer-link" data-action="route" data-route="meals">我的菜单</button>
      </div>
    </footer>
  `;
}

function renderToast() {
  return state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : "";
}

function renderFeatureTile(dish, variant = "small") {
  if (variant === "large") {
    return `
      <article class="showcase-card showcase-card--large">
        ${renderVisual(dish, "feature")}
        <div class="showcase-body">
          <div class="eyebrow">今日推荐</div>
          <h3>${escapeHtml(dish.name)}</h3>
          <p>${escapeHtml(buildIngredientSummary(dish, 3))}</p>
          <div class="meta-inline"><span>${formatPrice(dish.price)}</span><span>${dish.calories} kcal</span></div>
        </div>
      </article>
    `;
  }

  return `
    <article class="showcase-card showcase-card--small">
      ${renderVisual(dish, "compact")}
      <div class="showcase-mini-body">
        <h4>${escapeHtml(dish.name)}</h4>
        <p>${escapeHtml(buildIngredientSummary(dish, 2))}</p>
      </div>
    </article>
  `;
}

function renderDishCard(dish, mealKey, compact = false) {
  return `
    <article class="dish-card ${dish.selected ? "selected" : ""}">
      ${renderVisual(dish, compact ? "compact-card" : "card")}
      <div class="dish-card-body">
        <div class="dish-card-head">
          <div>
            <h3>${escapeHtml(dish.name)}</h3>
            <div class="dish-subtitle">${escapeHtml(dish.subcategory || dish.category)}</div>
          </div>
          <div class="dish-price">${formatPrice(dish.price)}</div>
        </div>
        <div class="dish-metrics-row">
          <span>⚡ ${dish.calories} kcal</span>
          <span>🥢 ${escapeHtml(dish.servingNote || "1份")}</span>
        </div>
        <div class="tag-list">
          ${(dish.ingredientPreview || []).map((ingredient) => `<span class="tag">${escapeHtml(ingredient)}</span>`).join("")}
        </div>
        <button class="dish-action ${dish.selected ? "selected" : ""}" data-action="toggle-dish" data-meal-key="${mealKey}" data-dish-id="${dish.id}">${dish.selected ? "已加入今日菜单" : "加入今日菜单"}</button>
      </div>
    </article>
  `;
}

function renderHome() {
  const showcase = buildShowcaseDishes();
  const summary = summarizeSelection();
  const steps = [
    { number: "01", title: "确定餐次节奏", desc: "先决定今天吃早餐、午餐、晚餐中的哪几餐，整个页面会跟着你的安排收拢。" },
    { number: "02", title: "筛分类别与偏好", desc: "按主菜、主食、汤羹、饮品继续缩小范围，再用荤素筛选快速聚焦。" },
    { number: "03", title: "一键汇总总量", desc: "选中的菜会实时汇总热量、花费和食材，做决定时不用在几个页面来回切。" }
  ];

  const content = `
    <section class="hero-section panel">
      <div class="hero-copy">
        <div class="badge-pill">你的饮食节奏</div>
        <h1>今天吃什么？<br />把三餐按你的节奏排好。</h1>
        <p>用中文版餐食规划网页整理早餐、午餐和晚餐。菜品、热量、预算和食材会在同一条链路里即时汇总。</p>
        <div class="cta-row">
          <button class="cta-primary" data-action="route" data-route="planner">开始规划</button>
          <button class="cta-secondary" data-action="route" data-route="meals">查看我的菜单</button>
        </div>
        <div class="hero-stats">
          <div><strong>${catalog.counts.totalDishes}</strong><span>道菜可选</span></div>
          <div><strong>${summary.selectedCount}</strong><span>道已加入菜单</span></div>
          <div><strong>${summary.selectedIngredientCount}</strong><span>种食材已汇总</span></div>
        </div>
      </div>
      <div class="hero-visual-wrap">
        ${renderVisual(showcase.hero, "hero", "今日灵感")}
      </div>
    </section>

    <section class="section-block">
      <div class="section-copy">
        <div class="section-kicker">按口味整理</div>
        <h2>今天先看这些菜</h2>
        <p>从现有菜库里挑出几道最适合放在首页的内容，让你一打开就能进入状态。</p>
      </div>
      <div class="showcase-grid">
        ${renderFeatureTile(showcase.seasonal, "large")}
        <div class="showcase-stack">
          ${renderFeatureTile(showcase.protein, "small")}
          ${renderFeatureTile(showcase.sip, "small")}
          <article class="showcase-card showcase-card--message">
            <div class="message-badge">晚间灵感</div>
            <h3>${escapeHtml(showcase.slow.name)}</h3>
            <p>${escapeHtml(buildIngredientSummary(showcase.slow, 2))}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="section-block section-block--center">
      <div class="section-copy section-copy--center">
        <div class="section-kicker">使用方式</div>
        <h2>三步就能把饭单排顺</h2>
        <p>保留你现在最常用的主流程，不把功能堆得太杂。</p>
      </div>
      <div class="steps-grid">
        ${steps.map((step) => `
          <article class="step-card panel">
            <div class="step-number">${step.number}</div>
            <h3>${step.title}</h3>
            <p>${step.desc}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="cta-band panel">
      <div class="cta-band-copy">
        <h2>准备好把今天的饭单排起来了吗？</h2>
        <p>继续用现在这套网页版规划你的三餐，也可以把已经选好的菜直接整理成采购清单。</p>
        <button class="cta-primary" data-action="route" data-route="planner">进入规划器</button>
      </div>
      <div class="mosaic-grid">
        ${showcase.mosaic.map((dish, index) => `
          <div class="mosaic-item mosaic-item--${index + 1}">
            ${renderVisual(dish, "mosaic", getDishBadge(dish))}
          </div>
        `).join("")}
      </div>
    </section>
  `;

  return renderShell("home", content);
}

function renderPlanner() {
  const vm = buildViewModel();

  const content = `
    <section class="summary-bar panel">
      <div class="summary-grid">
        <div class="summary-stat"><span class="summary-label">已选菜品</span><strong>${vm.selectedCount}</strong><em>道</em></div>
        <div class="summary-stat"><span class="summary-label">总热量</span><strong>${vm.totalCalories}</strong><em>kcal</em></div>
        <div class="summary-stat"><span class="summary-label">预计花费</span><strong>${formatPrice(vm.totalPrice)}</strong><em>总计</em></div>
        <div class="summary-stat"><span class="summary-label">准备食材</span><strong>${vm.selectedIngredientCount}</strong><em>种</em></div>
      </div>
      <div class="summary-toolbar">
        <div class="meal-switches">
          ${vm.mealTabs.map((meal) => `
            <button class="meal-switch ${meal.enabled ? "active" : ""}" data-action="toggle-meal" data-meal-key="${meal.key}">${meal.label}</button>
          `).join("")}
        </div>
        <div class="summary-buttons">
          <button class="text-action" data-action="clear-all">清空已选</button>
          <button class="cta-primary small" data-action="copy-list">生成采购清单</button>
        </div>
      </div>
    </section>

    <section class="planner-layout">
      <aside class="planner-sidebar panel">
        <div class="sidebar-section">
          <div class="sidebar-title">餐次</div>
          <div class="sidebar-stack">
            ${vm.mealTabs.map((meal) => `
              <button class="sidebar-meal ${meal.key === vm.currentMealKey ? "current" : ""} ${meal.enabled ? "" : "disabled"}" data-action="focus-meal" data-meal-key="${meal.key}">
                <span class="sidebar-icon">${MEAL_META[meal.key].icon}</span>
                <span>
                  <strong>${meal.label}</strong>
                  <em>${meal.enabled ? `${meal.selectedCount} 道已选` : "本轮未纳入"}</em>
                </span>
              </button>
            `).join("")}
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-title">分类</div>
          <div class="sidebar-stack">
            ${vm.categoryTabs.map((category) => `
              <button class="sidebar-filter ${category.id === vm.currentCategoryId ? "current" : ""}" data-action="focus-category" data-category-id="${category.id}">
                <span>${escapeHtml(category.label)}</span>
                <em>${category.count}</em>
              </button>
            `).join("")}
          </div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-title">偏好</div>
          <div class="sidebar-stack">
            ${vm.dietaryTabs.map((dietary) => `
              <button class="sidebar-filter slim ${dietary.id === vm.currentDietaryTypeId ? "current" : ""}" data-action="focus-dietary" data-dietary-id="${dietary.id}">
                <span>${escapeHtml(dietary.label)}</span>
                <em>${dietary.count}</em>
              </button>
            `).join("")}
          </div>
        </div>
      </aside>

      <section class="planner-main">
        <div class="planner-head">
          <div>
            <div class="section-kicker">${escapeHtml(vm.activeMealSummary)}</div>
            <h2>${escapeHtml(vm.currentMealTitle)}</h2>
            <p>${escapeHtml(vm.currentMealSubtitle)}</p>
          </div>
          <button class="text-action back-link" data-action="route" data-route="home">返回概览</button>
        </div>
        <div class="planner-context">
          <span class="context-pill">${escapeHtml(vm.currentCategoryLabel)}</span>
          <span class="context-pill muted">${escapeHtml(vm.currentDietaryTypeLabel)}</span>
          <span class="context-pill muted">当前 ${vm.visibleDishes.length} 道</span>
        </div>
        <div class="dish-grid">
          ${vm.visibleDishes.map((dish) => renderDishCard(dish, vm.currentMealKey)).join("")}
        </div>
      </section>
    </section>
  `;

  return renderShell("planner", content);
}

function renderMeals() {
  const summary = summarizeSelection();
  const groups = catalog.mealPeriods
    .map((meal) => ({
      meal,
      dishes: summary.selectedDishesByMeal[meal.key] || []
    }))
    .filter((group) => group.dishes.length);

  let content = `
    <section class="summary-bar panel">
      <div class="summary-grid">
        <div class="summary-stat"><span class="summary-label">本次菜单</span><strong>${summary.selectedCount}</strong><em>道</em></div>
        <div class="summary-stat"><span class="summary-label">热量合计</span><strong>${summary.totalCalories}</strong><em>kcal</em></div>
        <div class="summary-stat"><span class="summary-label">预计花费</span><strong>${formatPrice(summary.totalPrice)}</strong><em>总计</em></div>
        <div class="summary-stat"><span class="summary-label">食材种类</span><strong>${summary.selectedIngredientCount}</strong><em>种</em></div>
      </div>
      <div class="summary-toolbar align-right">
        <div class="summary-buttons">
          <button class="text-action" data-action="clear-all">清空菜单</button>
          <button class="cta-primary small" data-action="copy-list">复制采购清单</button>
        </div>
      </div>
    </section>
  `;

  if (!groups.length) {
    content += `
      <section class="empty-panel panel">
        <div class="section-kicker">我的菜单</div>
        <h2>你还没有把菜加入菜单。</h2>
        <p>先去规划器里挑几道早餐、午餐或晚餐，这里会自动帮你整理成今天的饭单。</p>
        <button class="cta-primary" data-action="route" data-route="planner">去规划器选菜</button>
      </section>
    `;
    return renderShell("meals", content);
  }

  content += `
    <section class="selected-layout">
      ${groups.map((group) => `
        <article class="selected-group panel">
          <div class="selected-group-head">
            <div>
              <div class="section-kicker">${escapeHtml(group.meal.label)}</div>
              <h2>${escapeHtml(MEAL_META[group.meal.key].title)}</h2>
            </div>
            <div class="context-pill">${group.dishes.length} 道</div>
          </div>
          <div class="selected-grid">
            ${group.dishes.map((dish) => `
              <article class="selected-card">
                ${renderVisual(dish, "selected")}
                <div class="selected-card-body">
                  <div>
                    <h3>${escapeHtml(dish.name)}</h3>
                    <p>${escapeHtml(buildIngredientSummary(dish, 2))}</p>
                  </div>
                  <div class="selected-meta"><span>${dish.calories} kcal</span><span>${formatPrice(dish.price)}</span></div>
                  <button class="text-action compact" data-action="toggle-dish" data-meal-key="${group.meal.key}" data-dish-id="${dish.id}">从菜单移除</button>
                </div>
              </article>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </section>
  `;

  return renderShell("meals", content);
}

function renderShell(route, content) {
  app.innerHTML = `
    <div class="page-shell page-shell--${route}">
      ${renderHeader(route)}
      <main class="page-content">${content}</main>
      ${renderFooter()}
      ${renderToast()}
    </div>
  `;
}

function showToast(message) {
  state.toast = message;
  render();

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2200);
}

function clearAll() {
  state.selectedIdsByMeal = { breakfast: [], lunch: [], dinner: [] };
  saveState();
}

async function copyGroceryList() {
  const summary = summarizeSelection();
  if (!summary.selectedCount) {
    showToast("先选几道菜，再生成采购清单。");
    return;
  }

  const lines = ["今日饭单", ""];
  catalog.mealPeriods.forEach((meal) => {
    const dishes = summary.selectedDishesByMeal[meal.key] || [];
    if (!dishes.length) {
      return;
    }
    lines.push(`${meal.label}`);
    dishes.forEach((dish) => {
      lines.push(`- ${dish.name} · ${formatPrice(dish.price)} · ${dish.calories} kcal`);
    });
    lines.push("");
  });
  lines.push(`总热量：${summary.totalCalories} kcal`);
  lines.push(`预计花费：${formatPrice(summary.totalPrice)}`);
  lines.push("食材清单：");
  summary.selectedIngredients.forEach((item) => {
    lines.push(`- ${item.name} x${item.count}`);
  });

  const text = lines.join("\n");

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast("采购清单已复制到剪贴板。");
  } catch (error) {
    console.error(error);
    showToast("复制失败了，可以稍后再试。");
  }
}

function handleClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;

  if (action === "route") {
    const route = trigger.dataset.route;
    window.location.hash = route === "home" ? "#home" : `#${route}`;
    return;
  }

  if (action === "clear-all") {
    clearAll();
    render();
    return;
  }

  if (action === "copy-list") {
    copyGroceryList();
    return;
  }

  if (action === "toggle-meal") {
    const mealKey = trigger.dataset.mealKey;
    const nextActiveMeals = state.activeMeals.includes(mealKey)
      ? state.activeMeals.filter((key) => key !== mealKey)
      : [...state.activeMeals, mealKey];

    if (!nextActiveMeals.length) {
      showToast("至少保留一餐，页面才能继续规划。");
      return;
    }

    state.activeMeals = nextActiveMeals;
    if (!state.activeMeals.includes(state.currentMealKey)) {
      state.currentMealKey = state.activeMeals[0];
    }
    saveState();
    render();
    return;
  }

  if (action === "focus-meal") {
    const mealKey = trigger.dataset.mealKey;
    if (!state.activeMeals.includes(mealKey)) {
      showToast("先把这餐加入本轮安排，再进入筛选。");
      return;
    }
    state.currentMealKey = mealKey;
    saveState();
    render();
    return;
  }

  if (action === "focus-category") {
    state.currentCategoryByMeal[state.currentMealKey] = trigger.dataset.categoryId;
    state.currentDietaryByMeal[state.currentMealKey] = "all";
    saveState();
    render();
    return;
  }

  if (action === "focus-dietary") {
    state.currentDietaryByMeal[state.currentMealKey] = trigger.dataset.dietaryId;
    saveState();
    render();
    return;
  }

  if (action === "toggle-dish") {
    const mealKey = trigger.dataset.mealKey;
    const dishId = trigger.dataset.dishId;
    if (!state.activeMeals.includes(mealKey)) {
      showToast("这餐目前未纳入本轮安排。");
      return;
    }
    const current = getSelectedIds(mealKey);
    const exists = current.includes(dishId);
    state.selectedIdsByMeal[mealKey] = exists ? current.filter((id) => id !== dishId) : [...current, dishId];
    state.currentMealKey = mealKey;
    saveState();
    render();
  }
}

function render() {
  syncRoute();
  if (!catalog) {
    app.innerHTML = '<div class="panel simple-panel"><h1>加载中...</h1></div>';
    return;
  }

  if (state.route === "planner") {
    renderPlanner();
    return;
  }

  if (state.route === "meals") {
    renderMeals();
    return;
  }

  renderHome();
}

async function init() {
  const response = await fetch("./assets/catalog.json");
  catalog = await response.json();
  dishLookup = Object.values(catalog.dishes).flat().reduce((result, dish) => {
    result[dish.id] = dish;
    return result;
  }, {});

  restoreState();
  syncRoute();
  render();
}

window.addEventListener("hashchange", () => {
  syncRoute();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
app.addEventListener("click", handleClick);
init().catch((error) => {
  console.error(error);
  app.innerHTML = '<div class="panel simple-panel"><h1>加载失败</h1><p>站点资源没有正确加载，可以稍后刷新页面再试。</p></div>';
});
