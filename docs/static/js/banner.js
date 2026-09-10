/* Block font, painted on canvas — or printed as characters.

   The name is drawn rather than set, because no web font can be trusted to
   carry the glyphs at the size this wants — and a bitmap grid is what a
   terminal would have had anyway. */

const FONT = {
 ' ':'...../...../...../...../.....',
 A:'.###./#...#/#####/#...#/#...#', B:'####./#...#/####./#...#/####.',
 C:'.####/#..../#..../#..../.####', D:'####./#...#/#...#/#...#/####.',
 E:'#####/#..../####./#..../#####', F:'#####/#..../####./#..../#....',
 G:'.####/#..../#..##/#...#/.####', H:'#...#/#...#/#####/#...#/#...#',
 I:'#####/..#../..#../..#../#####', J:'#####/...#./...#./#..#./.##..',
 K:'#...#/#..#./###../#..#./#...#', L:'#..../#..../#..../#..../#####',
 M:'#...#/##.##/#.#.#/#...#/#...#', N:'#...#/##..#/#.#.#/#..##/#...#',
 O:'.###./#...#/#...#/#...#/.###.', P:'####./#...#/####./#..../#....',
 Q:'.###./#...#/#...#/#..#./.##.#', R:'####./#...#/####./#..#./#...#',
 S:'.####/#..../.###./....#/####.', T:'#####/..#../..#../..#../..#..',
 U:'#...#/#...#/#...#/#...#/.###.', V:'#...#/#...#/#...#/.#.#./..#..',
 W:'#...#/#...#/#.#.#/##.##/#...#', X:'#...#/.#.#./..#../.#.#./#...#',
 Y:'#...#/.#.#./..#../..#../..#..', Z:'#####/...#./..#../.#.../#####',
 '0':'.###./#..##/#.#.#/##..#/.###.', '1':'..#../.##../..#../..#../.###.',
 '2':'.###./#...#/..##./.#.../#####', '3':'####./....#/.###./....#/####.',
 '4':'#...#/#...#/#####/....#/....#', '5':'#####/#..../####./....#/####.',
 '6':'.###./#..../####./#...#/.###.', '7':'#####/....#/...#./..#../..#..',
 '8':'.###./#...#/.###./#...#/.###.', '9':'.###./#...#/.####/....#/.###.',
 '.':'...../...../...../...../..##.', '-':'...../...../.###./...../.....',
 '/':'....#/...#./..#../.#.../#....', '!':'..#../..#../..#../...../..#..',
};
const DIA = {'Ğ':'G', 'Ü':'U', 'Ö':'O', 'İ':'I', 'Ş':'S', 'Ç':'C'};
const BREVE = ['#...#', '.###.'], UML = ['.#.#.', '.....'], DOT = ['..#..', '.....'];

export function grid(text){
  const cs = [...String(text).toUpperCase()], rows = [];
  if (cs.some(c => 'ĞÜÖİ'.includes(c)))
    for (let r = 0; r < 2; r++)
      rows.push(cs.map(c => c === 'Ğ' ? BREVE[r] : 'ÜÖ'.includes(c) ? UML[r]
                         : c === 'İ' ? DOT[r] : '.....').join('.'));
  for (let r = 0; r < 5; r++)
    rows.push(cs.map(c => (FONT[DIA[c] || c] || FONT[' ']).split('/')[r]).join('.'));
  return rows;
}

export function drawBanner(canvas, text, cell){
  /* The header is not on screen at every level of the touch layout, and a box
     with no width is nothing to fit a name into. Drawing to a guessed width
     sized the name for a screen that was not there, and it came back on the
     menu page a third wider than the phone holding it. */
  const avail = (canvas.parentElement?.clientWidth || 0) - 2;
  if (avail <= 0) return;
  const g = grid(text), cols = g[0].length, rows = g.length;
  const c = Math.max(2, Math.min(cell, Math.floor(avail / cols)));
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = cols * c * dpr; canvas.height = rows * c * dpr;
  canvas.style.width = cols * c + 'px'; canvas.style.height = rows * c + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--bright').trim();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    if (g[y][x] === '#') ctx.fillRect(x * c, y * c, c, c);
}
