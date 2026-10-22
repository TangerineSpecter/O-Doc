import {PixelPainter} from '../../Combat/art/pixelPainter';
import type {RecipeArtId, RecipeArtProfile} from './recipeVisuals';

const ink = '#4d4144';
const cream = '#fff0c5';
const gold = '#e7b44d';
const toast = '#ac693b';
const green = '#5d8d50';
const leaf = '#a9c56f';
const red = '#d96851';
const purple = '#766285';

function plate(g: PixelPainter) {
    g.ellipse(16, 23, 13, 5, ink);
    g.ellipse(16, 22, 12, 4, '#a8c6c1');
    g.ellipse(16, 21, 11, 3, '#e4eadb');
    g.rect(8, 25, 15, 1, '#7d9e9f');
}

function bowl(g: PixelPainter, rim = '#b8d0c8') {
    g.polygon([4, 17, 28, 17, 26, 24, 22, 28, 10, 28, 6, 24], ink);
    g.polygon([6, 18, 26, 18, 24, 24, 21, 26, 11, 26, 8, 23], rim);
    g.polygon([7, 19, 11, 20, 13, 25, 10, 24], '#e4eadb');
    g.ellipse(16, 17, 12, 4, ink);
    g.ellipse(16, 17, 10, 3, '#f0f2d9');
}

function scallion(g: PixelPainter, x: number, y: number) {
    g.rect(x, y, 2, 2, green);
    g.rect(x, y, 1, 1, leaf);
}

function strawberry(g: PixelPainter, x: number, y: number) {
    g.polygon([x, y + 1, x + 4, y, x + 6, y + 2, x + 5, y + 5, x + 3, y + 7, x, y + 4], '#8a3f4d');
    g.polygon([x + 1, y + 1, x + 4, y + 1, x + 5, y + 3, x + 3, y + 6, x + 1, y + 4], red);
    g.rect(x + 1, y, 4, 1, green);
    g.rect(x + 2, y - 1, 2, 1, leaf);
    g.rect(x + 2, y + 2, 1, 1, cream);
    g.rect(x + 4, y + 3, 1, 1, cream);
}

function peanut(g: PixelPainter, x: number, y: number) {
    g.polygon([x + 1, y, x + 4, y, x + 5, y + 2, x + 4, y + 5, x + 1, y + 5, x, y + 3], '#895744');
    g.rect(x + 1, y + 1, 3, 3, '#c68d59');
    g.rect(x + 1, y + 1, 2, 1, '#efc78b');
    g.rect(x + 2, y + 3, 1, 1, '#a86b47');
}

function eggplant(g: PixelPainter, points: readonly number[], highlight: readonly number[]) {
    g.polygon(points, '#51435f');
    g.polygon(highlight, purple);
}

function drawBakedPotato(g: PixelPainter) {
    plate(g);
    g.polygon([6, 17, 8, 11, 13, 7, 21, 7, 26, 12, 27, 18, 23, 23, 11, 24, 6, 21], ink);
    g.polygon([7, 17, 10, 11, 14, 8, 21, 8, 25, 12, 26, 18, 22, 22, 11, 23, 7, 20], toast);
    g.polygon([9, 15, 13, 10, 20, 9, 23, 12, 22, 17, 17, 21, 11, 21], gold);
    g.polygon([11, 14, 15, 10, 20, 10, 22, 12, 19, 15, 13, 19, 11, 18], '#fff0a4');
    g.rect(16, 12, 4, 3, '#fff7cc');
    g.rect(17, 15, 3, 1, '#c78f3b');
    scallion(g, 13, 14); scallion(g, 19, 17);
    g.rect(9, 19, 1, 1, '#dfab62'); g.rect(23, 16, 1, 1, '#f1cc85');
}

function drawSmashedCucumber(g: PixelPainter) {
    bowl(g);
    for (const [x, y] of [[7, 13], [13, 10], [19, 12], [11, 16], [20, 17]]) {
        g.polygon([x, y + 1, x + 5, y, x + 7, y + 3, x + 3, y + 6, x, y + 4], '#496b44');
        g.polygon([x + 1, y + 1, x + 4, y + 1, x + 5, y + 3, x + 3, y + 4, x + 1, y + 3], '#bad58b');
        g.rect(x + 2, y + 2, 2, 1, '#e1e9b0');
    }
    g.rect(11, 13, 1, 1, cream); g.rect(20, 15, 1, 1, cream);
    g.rect(17, 17, 1, 2, red); g.rect(9, 18, 2, 1, red);
}

function drawRoastedCorn(g: PixelPainter) {
    plate(g);
    g.polygon([7, 21, 9, 15, 21, 5, 25, 6, 27, 10, 24, 15, 13, 25, 9, 25], ink);
    g.polygon([9, 21, 11, 16, 22, 7, 25, 8, 25, 11, 22, 15, 12, 23], toast);
    g.polygon([9, 19, 11, 15, 21, 7, 24, 7, 25, 9, 22, 13, 12, 22], gold);
    for (const [x, y] of [[12, 16], [15, 13], [18, 10], [21, 8], [14, 18], [17, 15], [20, 12]]) {
        g.rect(x, y, 2, 2, '#fff0a4');
    }
    g.rect(16, 17, 2, 1, '#905f39'); g.rect(21, 11, 2, 1, '#905f39');
    g.polygon([7, 19, 10, 22, 17, 23, 12, 26, 8, 25, 5, 22], green);
    g.line(7, 22, 12, 24, leaf);
}

function drawRadishStirFry(g: PixelPainter) {
    plate(g);
    g.ellipse(16, 17, 10, 5, '#a97850');
    for (const [x, y] of [[7, 16], [12, 12], [19, 14], [10, 19], [18, 19]]) {
        g.polygon([x, y + 1, x + 6, y, x + 7, y + 3, x + 1, y + 4], '#b9574d');
        g.polygon([x + 1, y + 1, x + 5, y + 1, x + 6, y + 2, x + 1, y + 3], '#f0e7b7');
        g.rect(x + 2, y + 1, 3, 1, '#fff4d7');
    }
    scallion(g, 10, 15); scallion(g, 21, 19); scallion(g, 17, 12);
}

function drawTomatoEggs(g: PixelPainter) {
    plate(g);
    g.ellipse(16, 18, 10, 5, '#aa673d');
    g.polygon([7, 17, 9, 13, 13, 12, 16, 15, 14, 19, 10, 20], gold);
    g.polygon([15, 16, 18, 12, 23, 14, 25, 18, 21, 21, 16, 20], '#f2cd62');
    g.rect(10, 14, 3, 2, '#fff0a4'); g.rect(19, 15, 3, 2, '#fff0a4');
    g.polygon([6, 18, 10, 16, 13, 21, 9, 22], '#ad4945');
    g.polygon([7, 18, 10, 18, 12, 21, 9, 21], red);
    g.polygon([13, 13, 15, 10, 20, 12, 18, 16], '#ad4945');
    g.polygon([14, 13, 16, 11, 19, 12, 18, 15], red);
    g.rect(16, 12, 1, 1, '#ffbc78'); scallion(g, 15, 20);
}

function drawCabbageStirFry(g: PixelPainter) {
    plate(g);
    g.polygon([6, 18, 9, 13, 13, 14, 16, 9, 21, 11, 22, 14, 27, 17, 24, 22, 15, 23, 8, 21], '#607c4a');
    g.polygon([7, 17, 11, 14, 15, 16, 12, 21, 8, 20], leaf);
    g.polygon([14, 15, 17, 11, 20, 12, 21, 17, 18, 21, 13, 22], '#d6d79b');
    g.polygon([20, 17, 23, 15, 26, 18, 23, 21, 19, 22], '#b8cd86');
    g.line(17, 13, 17, 19, '#fff0c5'); g.line(9, 17, 12, 18, '#e4e6ab');
    g.line(21, 19, 24, 18, '#e4e6ab');
    g.rect(10, 13, 3, 1, red); g.rect(21, 22, 3, 1, red);
}

function drawSpicedPeanuts(g: PixelPainter) {
    bowl(g, '#c7926c');
    g.ellipse(16, 16, 10, 4, '#895744');
    for (const [x, y] of [[7, 13], [12, 10], [18, 11], [22, 14], [11, 16], [17, 16]]) peanut(g, x, y);
    g.rect(8, 18, 2, 1, red); g.rect(18, 13, 2, 1, red);
    g.rect(20, 19, 3, 1, red); scallion(g, 15, 15);
}

function drawPeanutSoymilk(g: PixelPainter) {
    g.ellipse(15, 26, 11, 3, ink);
    g.ellipse(15, 25, 10, 2, '#a8c6c1');
    g.polygon([22, 10, 28, 10, 30, 13, 29, 19, 24, 21, 21, 18], ink);
    g.polygon([23, 12, 27, 12, 28, 14, 27, 17, 24, 18], '#d9e4d9');
    g.rect(24, 13, 3, 3, '#fff0c5');
    g.polygon([6, 8, 24, 8, 23, 23, 20, 26, 10, 26, 7, 23], ink);
    g.polygon([8, 10, 22, 10, 21, 22, 19, 24, 11, 24, 9, 22], '#d5ceb3');
    g.rect(10, 13, 3, 9, '#f0f2d9');
    g.ellipse(15, 9, 9, 4, ink);
    g.ellipse(15, 9, 7, 2, '#ead7a9');
    g.rect(11, 8, 6, 1, '#fff4d7');
    peanut(g, 23, 22);
}

function drawEggplantRice(g: PixelPainter) {
    bowl(g);
    g.ellipse(16, 15, 10, 5, '#e4d6a7');
    g.ellipse(16, 13, 8, 4, '#f5e8ba');
    g.rect(10, 12, 2, 1, cream); g.rect(18, 11, 2, 1, cream);
    eggplant(g, [7, 16, 11, 11, 14, 12, 12, 17, 9, 19], [9, 15, 11, 12, 13, 13, 11, 17]);
    eggplant(g, [14, 15, 20, 11, 23, 13, 21, 17, 16, 19], [16, 15, 20, 12, 22, 13, 20, 16]);
    eggplant(g, [18, 19, 23, 16, 26, 18, 23, 21, 19, 22], [20, 19, 24, 17, 25, 18, 22, 20]);
    scallion(g, 16, 12); scallion(g, 13, 18);
}

function drawGardenFriedRice(g: PixelPainter) {
    plate(g);
    g.polygon([6, 20, 8, 15, 12, 10, 16, 8, 20, 10, 24, 14, 27, 20, 23, 23, 10, 23], '#ab7b49');
    g.polygon([7, 20, 10, 14, 14, 10, 18, 10, 23, 14, 25, 20, 22, 22, 11, 22], '#e8c877');
    for (const [x, y] of [[12, 12], [16, 14], [9, 18], [20, 19], [15, 20], [21, 15]]) g.rect(x, y, 2, 1, cream);
    for (const [x, y] of [[14, 10], [10, 16], [21, 17], [17, 21]]) scallion(g, x, y);
    g.rect(17, 12, 2, 2, '#dc8b45'); g.rect(13, 18, 2, 2, '#dc8b45');
    g.rect(20, 13, 2, 2, gold); g.rect(8, 20, 2, 1, gold);
}

function drawPumpkinSoup(g: PixelPainter) {
    bowl(g, '#c7926c');
    g.ellipse(16, 16, 11, 4, '#a36639');
    g.ellipse(16, 15, 10, 3, '#e8a34d');
    g.rect(10, 14, 9, 1, '#f4c878');
    g.line(13, 14, 19, 14, cream); g.line(19, 14, 20, 16, cream);
    g.line(19, 17, 15, 17, cream); g.rect(15, 16, 2, 1, cream);
    scallion(g, 14, 13); scallion(g, 16, 12);
    g.polygon([25, 22, 28, 8, 29, 7, 30, 8, 27, 23], '#8b7660');
    g.rect(28, 8, 1, 5, '#d9e4d9');
}

function drawOnionPancake(g: PixelPainter) {
    plate(g);
    g.ellipse(16, 18, 11, 7, '#8e5b3c');
    g.ellipse(16, 16, 11, 7, gold);
    g.ellipse(15, 15, 9, 5, '#edce85');
    g.line(7, 17, 17, 16, '#bc8748'); g.line(17, 16, 22, 11, '#bc8748');
    g.line(17, 16, 21, 21, '#bc8748');
    for (const [x, y] of [[11, 12], [17, 11], [21, 15], [11, 19], [16, 18], [7, 15]]) scallion(g, x, y);
    g.rect(13, 14, 2, 1, cream); g.rect(19, 19, 2, 1, cream);
}

function drawStrawberryPudding(g: PixelPainter) {
    plate(g);
    g.ellipse(16, 22, 9, 2, '#b95b59');
    g.polygon([11, 10, 21, 10, 25, 21, 22, 23, 10, 23, 7, 21], ink);
    g.polygon([12, 11, 20, 11, 23, 21, 21, 22, 11, 22, 9, 21], '#dca9a1');
    g.polygon([12, 11, 16, 11, 16, 21, 11, 21, 10, 20], '#f6d9b9');
    g.ellipse(16, 11, 5, 2, '#f3bdba');
    g.rect(12, 12, 2, 7, '#fff0c5');
    strawberry(g, 14, 5);
}

function drawSpicyEggplant(g: PixelPainter) {
    plate(g);
    g.ellipse(16, 19, 11, 4, '#9d6047');
    eggplant(g, [6, 17, 11, 11, 14, 12, 13, 16, 8, 21], [8, 17, 11, 12, 13, 13, 11, 17]);
    eggplant(g, [12, 19, 16, 11, 20, 12, 20, 15, 16, 22], [14, 19, 17, 12, 19, 13, 17, 18]);
    eggplant(g, [19, 21, 23, 13, 26, 14, 27, 17, 23, 23], [21, 20, 24, 14, 26, 15, 23, 21]);
    g.polygon([7, 13, 8, 12, 12, 14, 12, 16, 10, 16], red);
    g.polygon([17, 17, 19, 16, 23, 19, 23, 21, 20, 20], red);
    g.rect(9, 14, 1, 1, '#ffd39b'); g.rect(21, 19, 1, 1, '#ffd39b');
    scallion(g, 16, 14); scallion(g, 10, 20);
}

function drawVegetableRice(g: PixelPainter) {
    bowl(g, '#d0b991');
    g.ellipse(16, 15, 10, 5, '#b77a4d');
    g.ellipse(16, 14, 9, 4, '#d9aa64');
    g.rect(8, 14, 3, 2, '#b95246'); g.rect(19, 11, 4, 3, red);
    eggplant(g, [12, 11, 16, 10, 18, 14, 15, 16, 12, 14], [13, 12, 16, 11, 17, 14, 14, 14]);
    g.polygon([18, 16, 22, 14, 25, 17, 22, 20, 18, 19], '#607c4a');
    g.line(20, 17, 23, 17, leaf);
    g.rect(9, 18, 2, 1, cream); g.rect(15, 18, 2, 1, cream);
    scallion(g, 10, 12); scallion(g, 17, 15);
}

function drawMilkCornCake(g: PixelPainter) {
    plate(g);
    for (const y of [20, 16, 12]) {
        g.ellipse(16, y, 10, 5, '#96653e');
        g.ellipse(16, y - 1, 10, 4, gold);
        g.ellipse(15, y - 2, 8, 2, '#f1d58a');
    }
    g.rect(11, 10, 10, 2, cream); g.rect(12, 11, 3, 4, cream);
    g.rect(19, 11, 2, 3, cream);
    g.rect(16, 7, 4, 2, '#fff5c9'); g.rect(17, 9, 3, 1, '#d39e48');
    g.rect(9, 16, 2, 1, '#f5d36e'); g.rect(22, 20, 2, 1, '#f5d36e');
}

function drawSunflowerCrisp(g: PixelPainter) {
    plate(g);
    g.polygon([6, 16, 14, 12, 19, 17, 17, 23, 8, 23], '#8e5b3c');
    g.polygon([7, 16, 14, 13, 18, 17, 16, 21, 8, 21], '#d4a867');
    g.polygon([16, 12, 23, 10, 27, 15, 25, 21, 18, 21], '#8e5b3c');
    g.polygon([17, 12, 23, 11, 26, 15, 24, 19, 18, 19], '#e4bd7a');
    g.polygon([10, 10, 17, 8, 23, 11, 20, 16, 12, 16], '#8e5b3c');
    g.polygon([11, 10, 17, 9, 22, 11, 19, 14, 12, 14], '#edce85');
    for (const [x, y] of [[12, 10], [17, 10], [15, 12], [21, 13], [23, 16], [10, 17], [13, 19], [19, 17]]) {
        g.rect(x, y, 1, 2, '#6e5c49'); g.rect(x, y, 1, 1, '#f8e6b3');
    }
}

function drawStrawberryCake(g: PixelPainter) {
    plate(g);
    g.polygon([6, 15, 20, 8, 27, 14, 27, 23, 15, 26, 6, 22], ink);
    g.polygon([7, 15, 20, 10, 26, 14, 26, 22, 15, 24, 7, 21], '#e6b69c');
    g.polygon([7, 16, 15, 19, 26, 16, 26, 19, 15, 22, 7, 19], '#b95b6a');
    g.polygon([7, 18, 15, 21, 26, 18, 26, 20, 15, 23, 7, 20], '#fff0c5');
    g.polygon([7, 14, 20, 8, 26, 13, 15, 17, 7, 15], '#fff0c5');
    g.polygon([7, 15, 15, 17, 26, 14, 26, 16, 15, 19, 7, 16], '#f4d3be');
    strawberry(g, 16, 5); g.rect(10, 14, 2, 1, '#f4b6ae');
}

function drawPumpkinPie(g: PixelPainter) {
    plate(g);
    g.ellipse(16, 18, 12, 7, '#8e5b3c');
    g.ellipse(16, 16, 12, 7, '#d1a35e');
    g.ellipse(16, 15, 10, 5, '#b86637');
    g.ellipse(16, 14, 9, 4, '#e4a354');
    g.line(9, 12, 22, 17, '#f1c77a', 2);
    g.line(13, 10, 25, 14, '#f1c77a', 2);
    g.line(8, 17, 19, 11, '#f1c77a', 2);
    g.line(13, 19, 24, 13, '#f1c77a', 2);
    g.rect(13, 12, 6, 3, cream); g.rect(15, 10, 3, 2, '#fff5d7');
    g.rect(6, 17, 2, 1, '#edce85'); g.rect(23, 18, 2, 1, '#edce85');
}

function drawHarvestPlatter(g: PixelPainter) {
    plate(g);
    g.polygon([6, 17, 8, 12, 13, 11, 16, 15, 14, 21, 8, 22], ink);
    g.polygon([7, 17, 9, 13, 12, 12, 15, 15, 13, 20, 9, 21], gold);
    g.rect(9, 15, 3, 1, '#fff0a4');
    g.polygon([17, 11, 20, 7, 23, 8, 25, 14, 22, 18, 18, 16], '#8e5b3c');
    g.polygon([18, 11, 20, 8, 22, 9, 24, 14, 22, 16, 19, 15], '#f2cd62');
    g.rect(20, 10, 1, 2, cream); g.rect(22, 13, 1, 2, cream);
    g.ellipse(17, 20, 4, 3, '#ad4945'); g.ellipse(16, 19, 3, 2, red);
    scallion(g, 15, 17);
    eggplant(g, [21, 21, 23, 17, 26, 16, 28, 18, 26, 22, 23, 24], [23, 20, 25, 17, 27, 18, 25, 22]);
    g.polygon([5, 13, 7, 9, 11, 8, 13, 11, 10, 14, 7, 15], green);
    g.line(7, 11, 10, 12, leaf);
    g.polygon([9, 23, 10, 20, 14, 22, 13, 25], '#496b44');
    g.rect(11, 22, 2, 2, '#bad58b');
}

const drawings: Record<RecipeArtId, (g: PixelPainter) => void> = {
    baked_potato: drawBakedPotato,
    smashed_cucumber: drawSmashedCucumber,
    roasted_corn: drawRoastedCorn,
    radish_stir_fry: drawRadishStirFry,
    tomato_eggs: drawTomatoEggs,
    cabbage_stir_fry: drawCabbageStirFry,
    spiced_peanuts: drawSpicedPeanuts,
    peanut_soymilk: drawPeanutSoymilk,
    eggplant_rice: drawEggplantRice,
    garden_fried_rice: drawGardenFriedRice,
    pumpkin_soup: drawPumpkinSoup,
    onion_pancake: drawOnionPancake,
    strawberry_pudding: drawStrawberryPudding,
    spicy_eggplant: drawSpicyEggplant,
    vegetable_rice: drawVegetableRice,
    milk_corn_cake: drawMilkCornCake,
    sunflower_crisp: drawSunflowerCrisp,
    strawberry_cake: drawStrawberryCake,
    pumpkin_pie: drawPumpkinPie,
    harvest_platter: drawHarvestPlatter,
};

/** Integer-grid food sprites share the potion atlas's outline, highlights and soft ground shadow. */
export function drawRecipeArt(ctx: CanvasRenderingContext2D, profile: RecipeArtProfile) {
    ctx.clearRect(0, 0, 32, 32);
    const g = new PixelPainter(ctx);
    g.ellipse(16, 29, 11, 1, '#cbd9d0');
    drawings[profile.id](g);
}
