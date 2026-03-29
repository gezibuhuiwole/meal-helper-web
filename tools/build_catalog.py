#!/usr/bin/env python3
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / 'data' / 'exports'
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)


def read_csv(path):
    with path.open('r', encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))


def build_catalog(root_dir: Path):
    meal_rows = read_csv(EXPORTS / 'meal_periods.csv')
    dish_rows = read_csv(EXPORTS / 'catalog_master.csv')
    meal_by_id = {row['id']: row for row in meal_rows}
    meal_periods = [
        {
            'id': row['id'],
            'key': row['key'],
            'label': row['label'],
            'sortOrder': int(row['sortOrder'])
        }
        for row in sorted(meal_rows, key=lambda row: int(row['sortOrder']))
    ]

    dishes_by_meal = {row['key']: [] for row in meal_periods}
    all_dishes = []

    for row in dish_rows:
        if row['isActive'].strip().lower() != 'true':
            continue

        meal_period_ids = [item.strip() for item in row['mealPeriodIds'].split('/') if item.strip()]
        ingredients = [item.strip() for item in row['ingredients'].replace('，', '、').split('、') if item.strip()]
        dish = {
            'id': row['dishId'],
            'name': row['name'],
            'cuisine': row['cuisineName'],
            'cuisineId': row['cuisineId'],
            'region': row['regionName'],
            'regionId': row['regionId'],
            'category': row['categoryName'],
            'categoryId': row['categoryId'],
            'subcategory': row['subcategoryName'],
            'subcategoryId': row['subcategoryId'],
            'dietaryType': row['dietaryTypeLabel'],
            'dietaryTypeId': row['dietaryTypeId'],
            'defaultMealPeriodId': row['defaultMealPeriodId'],
            'mealPeriodIds': meal_period_ids,
            'ingredients': ingredients,
            'calories': int(float(row['caloriesKcal'] or 0)),
            'price': int(float(row['priceEstimateCny'] or 0)),
            'servingNote': row['servingNote']
        }
        all_dishes.append(dish)

        for meal_id in meal_period_ids:
            meal = meal_by_id.get(meal_id)
            if meal:
                dishes_by_meal[meal['key']].append(dish)

    for meal_key, rows in dishes_by_meal.items():
        dishes_by_meal[meal_key] = sorted(rows, key=lambda row: (row['price'], row['calories'], row['name']))

    return {
        'mealPeriods': meal_periods,
        'dishes': dishes_by_meal,
        'counts': {
            'totalDishes': len(all_dishes),
            'mealDishCounts': {key: len(value) for key, value in dishes_by_meal.items()}
        }
    }

catalog = build_catalog(ROOT)
(ASSETS / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
