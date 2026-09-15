/** The TXT reader's currentPage counts spreads, not individual text pages. */
export function quoteSpread(pages: string[], quote: string, pagesPerSpread: number): number | null {
    if (!quote || pagesPerSpread < 1) return null;
    const index = pages.findIndex(page => page.includes(quote.slice(0, 50)));
    return index < 0 ? null : Math.floor(index / pagesPerSpread) + 1;
}
