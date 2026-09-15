import type {ECharts} from 'echarts';

// Keep ECharts' graph-coordinate access isolated from business components.
interface GraphSeries {
    coordinateSystem?: {getZoom: () => number; dataToPoint: (point: number[]) => number[]};
    getData: () => {count: () => number; getItemLayout: (index: number) => number[]};
}
interface GraphModel {
    getModel: () => {getSeriesByIndex: (index: number) => GraphSeries | undefined};
    getViewOfSeriesModel: (series: GraphSeries) => {_layouting?: boolean} | undefined;
}

function syncGraphNodeScale(chart: ECharts, originX: number, originY: number) {
    // ECharts 6 graphRoam refreshes symbol compensation before updating the
    // coordinate zoom. A neutral follow-up uses the now-current coordinates,
    // keeping circles at their configured pixel size without moving the view.
    chart.dispatchAction({type: 'graphRoam', seriesIndex: 0, zoom: 1, originX, originY}, {silent: true});
}

/** Fits actual force positions without restarting physics or growing nodes. */
export function fitGraphViewport(chart: ECharts) {
    const series = (chart as unknown as GraphModel).getModel().getSeriesByIndex(0);
    const coordinates = series?.coordinateSystem;
    if (!series || !coordinates) return;
    const data = series.getData();
    const points = Array.from({length: data.count()}, (_, i) => coordinates.dataToPoint(data.getItemLayout(i)))
        .filter(point => point.length >= 2 && point.every(Number.isFinite));
    if (!points.length) return;
    const left = Math.min(...points.map(p => p[0]));
    const right = Math.max(...points.map(p => p[0]));
    const top = Math.min(...points.map(p => p[1]));
    const bottom = Math.max(...points.map(p => p[1]));
    const width = chart.getWidth();
    const height = chart.getHeight();
    const zoom = coordinates.getZoom();
    // Compute an absolute overview zoom, not a shrink-only multiplier. This
    // makes entering the tab and resetting converge to the same view even
    // when earlier force iterations had a different extent.
    const factor = Math.max(.15 / zoom, Math.min(.8 / zoom, Math.max(80, width - 200) / Math.max(1, right - left), Math.max(80, height - 160) / Math.max(1, bottom - top)));
    const originX = (left + right) / 2;
    const originY = (top + bottom) / 2;
    chart.dispatchAction({type: 'downplay', seriesIndex: 0});
    chart.dispatchAction({type: 'graphRoam', seriesIndex: 0, zoom: factor, originX, originY}, {silent: true});
    chart.dispatchAction({type: 'graphRoam', seriesIndex: 0, dx: width / 2 - originX, dy: height / 2 + 8 - originY});
    syncGraphNodeScale(chart, originX, originY);
}

export function installGraphViewport(chart: ECharts) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const stop = () => {clearTimeout(timer); timer = undefined;};
    const followLayout = () => {
        if (disposed) return;
        fitGraphViewport(chart);
        const instance = chart as unknown as GraphModel;
        const series = instance.getModel().getSeriesByIndex(0);
        // Force updates run on ECharts' own timeout, not its animation queue.
        // A quiet rendered/finished event does not mean physics has finished.
        // Sample the actual view state and fit once more on the final step.
        if (series && instance.getViewOfSeriesModel(series)?._layouting) {
            timer = setTimeout(followLayout, 150);
        } else timer = undefined;
    };
    const fit = () => {stop(); followLayout();};
    const onHover = (params: {dataType?: string}) => {if (params.dataType === 'node') stop();};
    const onRoam = (params: {zoom?: number; originX?: number; originY?: number}) => {
        if (params.zoom !== undefined && params.zoom !== 1 && params.originX !== undefined && params.originY !== undefined) {
            syncGraphNodeScale(chart, params.originX, params.originY);
        }
    };
    chart.on('graphroam', onRoam);
    chart.on('mouseover', onHover);
    chart.getZr().on('mousedown', stop);
    chart.getZr().on('mousewheel', stop);
    // Initial entry and the reset button intentionally use this same path.
    // Manual pan/drag/zoom cancels camera following, including queued fits.
    fit();
    return {fit, dispose: () => {disposed = true; stop(); chart.off('graphroam', onRoam); chart.off('mouseover', onHover); chart.getZr().off('mousedown', stop); chart.getZr().off('mousewheel', stop);}};
}
