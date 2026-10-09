import type {ECharts} from 'echarts/core';

interface ForceSeries {
    coordinateSystem?: {type?: string; dataToPoint: (point: number[]) => number[]};
    getData: () => {count: () => number; getItemLayout: (index: number) => number[]};
}
interface ForceChart {
    getModel: () => {getSeriesByIndex: (index: number) => ForceSeries | undefined};
    getViewOfSeriesModel: (series: ForceSeries) => {_layouting?: boolean};
}

/** Follow the initial simulation, but relinquish the camera as soon as the user interacts. */
export function installRelationGraphViewport(chart: ECharts, onFit: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const stop = () => {clearTimeout(timer); timer = undefined;};
    const follow = () => {
        if (disposed || chart.isDisposed()) return;
        const instance = chart as unknown as ForceChart;
        const series = instance.getModel().getSeriesByIndex(0);
        const coordinates = series?.coordinateSystem;
        if (!series || coordinates?.type !== 'view' || typeof coordinates.dataToPoint !== 'function') return;
        const data = series.getData();
        const points = Array.from({length: data.count()}, (_, i) => coordinates.dataToPoint(data.getItemLayout(i)))
            .filter(point => point.every(Number.isFinite));
        if (points.length) {
            const xs = points.map(point => point[0]);
            const ys = points.map(point => point[1]);
            const left = Math.min(...xs), right = Math.max(...xs);
            const top = Math.min(...ys), bottom = Math.max(...ys);
            const width = chart.getWidth(), height = chart.getHeight();
            const originX = (left + right) / 2, originY = (top + bottom) / 2;
            // Graph roam updates the public option; do not assume internal coordinate methods.
            const option = chart.getOption() as {series?: {zoom?: number}[]};
            const configuredZoom = option.series?.[0]?.zoom;
            const zoom = typeof configuredZoom === 'number' && Number.isFinite(configuredZoom) && configuredZoom > 0
                ? configuredZoom : 1;
            const factor = Math.max(0.25 / zoom, Math.min(1 / zoom,
                Math.max(80, width - 120) / Math.max(1, right - left),
                Math.max(80, height - 130) / Math.max(1, bottom - top)));
            chart.dispatchAction({type: 'graphRoam', seriesIndex: 0, zoom: factor, originX, originY}, {silent: true});
            chart.dispatchAction({type: 'graphRoam', seriesIndex: 0, dx: width / 2 - originX, dy: height / 2 - originY}, {silent: true});
            // ECharts updates image compensation before coordinate zoom; synchronize once after it.
            chart.dispatchAction({type: 'graphRoam', seriesIndex: 0, zoom: 1, originX, originY}, {silent: true});
            onFit();
        }
        timer = instance.getViewOfSeriesModel(series)._layouting ? setTimeout(follow, 250) : undefined;
    };
    const fit = () => {stop(); follow();};
    chart.getZr().on('mousedown', stop);
    chart.getZr().on('mousewheel', stop);
    chart.on('mouseover', stop);
    fit();
    return {fit, dispose: () => {
        disposed = true;
        stop();
        chart.getZr().off('mousedown', stop);
        chart.getZr().off('mousewheel', stop);
        chart.off('mouseover', stop);
    }};
}
