/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

import "../style/visual.less";
// import "core-js/stable";
// import "@babel/polyfill";


import powerbi from "powerbi-visuals-api";
import ISelectionManager = powerbi.extensibility.ISelectionManager;

import {
    select as d3Select,
    selectAll as d3SelectAll,
    Selection as D3Selection,
} from "d3-selection";
import * as d3 from "d3";
import * as $ from "jquery";

import {
    drag as d3Drag,
} from "d3-drag";

import {
    arc as d3Arc,
} from "d3-shape";

import powerbiVisualsApi from "powerbi-visuals-api";

import {
    AdvancedFilter,
    IFilterColumnTarget,
} from "powerbi-models";

import {
    CssConstants,
    manipulation as svgManipulation,
} from "powerbi-visuals-utils-svgutils";

import { pixelConverter } from "powerbi-visuals-utils-typeutils";

import { textMeasurementService } from "powerbi-visuals-utils-formattingutils";

import { interactivityFilterService } from "powerbi-visuals-utils-interactivityutils";
import extractFilterColumnTarget = interactivityFilterService.extractFilterColumnTarget;

import {
    dataLabelInterfaces,
    dataLabelUtils,
} from "powerbi-visuals-utils-chartutils";

import {
    ICursorDataPoint,
    ITimelineCursorOverElement,
    ITimelineData,
    ITimelineDataPoint,
    ITimelineLabel,
    ITimelineMargins,
    ITimelineProperties,
    ITimelineSelectors,
} from "./dataInterfaces";

import { CalendarSettings } from "./settings/calendarSettings";
import { CellsSettings } from "./settings/cellsSettings";
import { LabelsSettings } from "./settings/labelsSettings";
import { VisualSettings } from "./settings/VisualSettings";

import { TimelineGranularityData } from "./granularity/TimelineGranularityData";
import { GranularityNames } from "./granularity/granularityNames";
import { GranularityType } from "./granularity/granularityType";

import {
    ITimelineDatePeriod,
    ITimelineDatePeriodBase,
} from "./datePeriod/datePeriod";

import { TimelineDatePeriodBase } from "./datePeriod/TimelineDatePeriodBase";

import { Calendar } from "./calendar";
import { Utils } from "./utils";
// import { Console } from "console";

export class paraTimeline implements powerbiVisualsApi.extensibility.visual.IVisual {
    public static SETVALIDCALENDARSETTINGS(calendarSettings: CalendarSettings): void {
        const defaultSettings = VisualSettings.getDefault();
        const theLatestDayOfMonth: number = Utils.GETTHELATESTDAYOFMONTH(calendarSettings.month);

        calendarSettings.day = Math.max(
            defaultSettings["calendar"].day,
            Math.min(theLatestDayOfMonth, calendarSettings.day),
        );
    }

    public static SELECTCURRENTPERIOD(
        datePeriod: ITimelineDatePeriodBase,
        granularity: GranularityType,
        calendar,
    ) {
        return this.SELECTPRIOD1(datePeriod, granularity, calendar, Utils.RESETTIME(new Date()));
    }

    public static CONVERTER(
        timelineData: ITimelineData,
        timelineProperties: ITimelineProperties,
        timelineGranularityData: TimelineGranularityData,
        dataView: powerbiVisualsApi.DataView,
        initialized: boolean,
        timelineSettings: VisualSettings,
        viewport: powerbiVisualsApi.IViewport,
        previousCalendar: Calendar,
        setting: VisualSettings,
        timelineSize: number
    ): Calendar {
        if (this.isdataviewvalid(dataView)) {
            return null;
        }

        let calendar: Calendar;
        let isCalendarChanged: boolean;
        let startDate: Date;
        let endDate: Date;
        let timelineElements: ITimelineDatePeriod[];
        let countFullCells: number;

        if (!initialized) {
            timelineData.cursorDataPoints = [{
                cursorIndex: 0,
                selectionIndex: paraTimeline.DefaultSelectionStartIndex,
                x: paraTimeline.DefaultCursorDatapointX,
                y: paraTimeline.DefaultCursorDatapointY,
            },
            {
                cursorIndex: 1,
                selectionIndex: paraTimeline.DefaultSelectionStartIndex,
                x: paraTimeline.DefaultCursorDatapointX,
                y: paraTimeline.DefaultCursorDatapointY,
            }];
        }

        isCalendarChanged = previousCalendar
            && previousCalendar.isChanged(timelineSettings.calendar, timelineSettings.weekDay);

        if (timelineData && timelineData.currentGranularity) {
            startDate = Utils.GETSTARTSELECTIONDATE(timelineData);
            endDate = Utils.GETENDSELECTIONDATE(timelineData);
        }

        if (!initialized || isCalendarChanged) {
            calendar = new Calendar(timelineSettings.calendar, timelineSettings.weekDay);
            timelineData.currentGranularity = timelineGranularityData.getGranularity(
                timelineSettings.granularity.granularity);
        } else {
            calendar = previousCalendar;

        }
        if (!initialized) {
            timelineData.selectionStartIndex = 0;
            timelineData.selectionEndIndex = timelineData.currentGranularity.getDatePeriods().length - 1;
        }

        const category: powerbiVisualsApi.DataViewCategoryColumn = dataView.categorical.categories[0];
        timelineData.filterColumnTarget = extractFilterColumnTarget(category);

        if (category.source.type.numeric) {
            timelineData.filterColumnTarget["ref"] = "Date";
        }

        if (isCalendarChanged && startDate && endDate) {
            Utils.UNSEPARATESELECTION(timelineData.currentGranularity.getDatePeriods());
            Utils.SEPARATESELECTION(timelineData, startDate, endDate);
        }

        timelineElements = timelineData.currentGranularity.getDatePeriods();

        timelineData.timelineDataPoints = [];

        for (const currentTimePeriod of timelineElements) {
            const datapoint: ITimelineDataPoint = {
                datePeriod: currentTimePeriod,
                index: currentTimePeriod.index,
            };

            timelineData.timelineDataPoints.push(datapoint);
        }

        countFullCells = timelineData.currentGranularity
            .getDatePeriods()
            .filter((datePeriod: ITimelineDatePeriod) => {
                return datePeriod.index % 1 === 0;
            })
            .length;

        paraTimeline.setmeasures(
            timelineSettings.labels,
            timelineData.currentGranularity.getType(),
            countFullCells,
            viewport,
            timelineProperties,
            paraTimeline.TimelineMargins,
            timelineSize
        );

        paraTimeline.updatecursors(timelineData);

        return calendar;
    }

    public static SELECTPRIOD1(
        datePeriod: ITimelineDatePeriodBase,
        granularity: GranularityType,
        calendar,
        periodDate: Date,
    ) {
        let startDate: Date = periodDate;
        let endDate: Date;

        switch (granularity) {
            case GranularityType.day:
                endDate = calendar.getNextDate(periodDate);
                break;
            case GranularityType.week:
                ({ startDate, endDate } = calendar.getWeekPeriod(periodDate));
                break;
            case GranularityType.month:
                ({ startDate, endDate } = calendar.getMonthPeriod(periodDate));
                break;
            case GranularityType.quarter:
                ({ startDate, endDate } = calendar.getQuarterPeriod(periodDate));
                break;
            case GranularityType.year:
                ({ startDate, endDate } = calendar.getYearPeriod(periodDate));
                break;
        }

        if (granularity === GranularityType.day) {
            const checkDatesForDayGranularity: boolean =
                datePeriod.startDate <= startDate && endDate <= datePeriod.endDate ||
                startDate.toString() === datePeriod.endDate.toString();

            if (!checkDatesForDayGranularity) {
                startDate = null;
                endDate = null;
            }
        } else {
            const startDateAvailable = (datePeriod.startDate <= startDate && startDate <= datePeriod.endDate);
            const endDateAvailable = (datePeriod.startDate <= endDate && endDate <= datePeriod.endDate);

            if (!startDateAvailable && !endDateAvailable) {
                startDate = null;
                endDate = null;
            }
        }

        return { startDate, endDate };
    }

    public static AREVISUALUPDATEOPTIONSVALID(options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions): boolean {
        if (!options
            || !options.dataViews
            || !options.dataViews[0]
            || !options.dataViews[0].metadata
            || !paraTimeline.ISDATAVIEWCATEGORICALVALID(options.dataViews[0].categorical)) {

            return false;
        }

        const dataView: powerbiVisualsApi.DataView = options.dataViews[0];
        const columnExp: any = dataView.categorical.categories[0].source.expr;
        let valueType: string;

        valueType = columnExp
            ? columnExp.level
            : null;

        if (!(dataView.categorical.categories[0].source.type.dateTime
            || (dataView.categorical.categories[0].source.type.numeric
                && (valueType === "Year" || valueType === "Date")))) {
            return false;
        }

        return true;
    }

    public static ISDATAVIEWCATEGORICALVALID(dataViewCategorical: powerbiVisualsApi.DataViewCategorical): boolean {
        return !(!dataViewCategorical
            || !dataViewCategorical.categories
            || dataViewCategorical.categories.length !== 1
            || !dataViewCategorical.categories[0].values
            || dataViewCategorical.categories[0].values.length === 0
            || !dataViewCategorical.categories[0].source
            || !dataViewCategorical.categories[0].source.type
        );
    }

    private static TimelineMargins: ITimelineMargins = {
        BottomMargin: 10,
        CellHeight: 25,
        CellWidth: 40,
        ElementWidth: 30,
        HeightOffset: 75,
        LeftMargin: 15,
        LegendHeight: 50,
        LegendHeightOffset: 4,
        LegendHeightRange: 20,
        MaxCellHeight: 60,
        MinCellHeight: 20,
        MinCellWidth: 40,
        PeriodSlicerRectHeight: 23,
        PeriodSlicerRectWidth: 15,
        RightMargin: 15,
        StartXpoint: 10,
        StartYpoint: 20,
        TopMargin: 0,
    };

    private static MinSizeOfViewport: number = 0;

    private static DefaultTextYPosition: number = 50;

    private static CellsYPositionFactor: number = 3;
    private static CellsYPositionOffset: number = 65;

    private static SelectedTextSelectionFactor: number = 2;
    private static SelectedTextSelectionYOffset: number = 17;

    private static LabelSizeFactor: number = 1.5;
    private static TimelinePropertiesHeightOffset: number = 30;

    private static DefaultCursorDatapointX: number = 0;
    private static DefaultCursorDatapointY: number = 0;
    private static DefaultSelectionStartIndex: number = 0;

    private static CellHeightDivider: number = 2;

    private static DefaultFontFamily: string = "arial";

    private static TextWidthMiddleDivider: number = 2;

    private static SvgWidthOffset: number = 1;

    private static DefaultYDiff: number = 1.5;

    private static DefaultOverflow: string = "auto";

    private static CellWidthLastFactor: number = 0.9;
    private static CellWidthNotLastFactor: number = 3;

    private static LabelIdOffset: number = 0.5;
    private static GranularityNamesLength: number = 2;

    private static DefaultRangeTextSelectionY: number = 40;

    private static ViewportWidthAdjustment: number = 2;
    public static timeZone = "America/New_York";

    private static filterObjectProperty: { objectName: string, propertyName: string } = {
        objectName: "general",
        propertyName: "filter",
    };

    private static TimelineSelectors: ITimelineSelectors = {
        Cell: CssConstants.createClassAndSelector("cell"),
        CellRect: CssConstants.createClassAndSelector("cellRect"),
        CellsArea: CssConstants.createClassAndSelector("cellsArea"),
        CursorsArea: CssConstants.createClassAndSelector("cursorsArea"),
        LowerTextArea: CssConstants.createClassAndSelector("lowerTextArea"),
        LowerTextCell: CssConstants.createClassAndSelector("lowerTextCell"),
        MainArea: CssConstants.createClassAndSelector("mainArea"),
        PeriodSlicerGranularities: CssConstants.createClassAndSelector("periodSlicerGranularities"),
        PeriodSlicerRect: CssConstants.createClassAndSelector("periodSlicerRect"),
        PeriodSlicerSelection: CssConstants.createClassAndSelector("periodSlicerSelection"),
        PeriodSlicerSelectionRect: CssConstants.createClassAndSelector("periodSlicerSelectionRect"),
        RangeTextArea: CssConstants.createClassAndSelector("rangeTextArea"),
        SelectionCursor: CssConstants.createClassAndSelector("selectionCursor"),
        SelectionRangeContainer: CssConstants.createClassAndSelector("selectionRangeContainer"),
        TextLabel: CssConstants.createClassAndSelector("label"),
        TimelineSlicer: CssConstants.createClassAndSelector("timelineSlicer"),
        TimelineVisual: CssConstants.createClassAndSelector("timeline"),
        TimelineWrapper: CssConstants.createClassAndSelector("timelineWrapper"),
        UpperTextArea: CssConstants.createClassAndSelector("upperTextArea"),
        UpperTextCell: CssConstants.createClassAndSelector("upperTextCell"),
    };

    private static updatecursors(timelineData: ITimelineData): void {
        const startDate: ITimelineDatePeriod = timelineData.timelineDataPoints[timelineData.selectionStartIndex].datePeriod;
        const endDate: ITimelineDatePeriod = timelineData.timelineDataPoints[timelineData.selectionEndIndex].datePeriod;

        timelineData.cursorDataPoints[0].selectionIndex = startDate.index;
        timelineData.cursorDataPoints[1].selectionIndex = endDate.index + endDate.fraction;
    }

    private static isdataviewvalid(dataView): boolean {
        if (!dataView
            || !dataView.categorical
            || !dataView.metadata
            || dataView.categorical.categories.length <= 0
            || !dataView.categorical.categories[0]
            || !dataView.categorical.categories[0].identityFields
            || dataView.categorical.categories[0].identityFields.length <= 0) {

            return true;
        }

        return false;
    }

    private static setmeasures(
        labelsSettings: LabelsSettings,
        granularityType: GranularityType,
        datePeriodsCount: number,
        viewport: powerbiVisualsApi.IViewport,
        timelineProperties: ITimelineProperties,
        timelineMargins: ITimelineMargins,
        timelineSize: number
    ): void {

        timelineProperties.cellsYPosition = timelineProperties.textYPosition;

        let height: number;
        let width: number;

        const labelSize: number = pixelConverter.fromPointToPixel(labelsSettings.textSize);

        if (labelsSettings.show) {
            const granularityOffset: number = labelsSettings.displayAll ? granularityType + 1 : 1;

            timelineProperties.cellsYPosition += labelSize
                * paraTimeline.LabelSizeFactor
                * granularityOffset;
        }

        const svgHeight: number = Math.max(0, viewport.height - timelineMargins.TopMargin);

        height = Math.max(timelineMargins.MinCellHeight,
            Math.min(
                timelineMargins.MaxCellHeight,
                svgHeight
                // - timelineProperties.cellsYPosition
                - paraTimeline.TimelinePropertiesHeightOffset
                + (paraTimeline.TimelineMargins.LegendHeight - timelineProperties.legendHeight),
            ));

        // Height is deducted here to take account of edge cursors width
        // that in fact is half of cell height for each of them
        width = Math.max(
            timelineMargins.MinCellWidth,
            (viewport.width * timelineSize - height - paraTimeline.ViewportWidthAdjustment) / (datePeriodsCount));

        timelineProperties.cellHeight = height;
        timelineProperties.cellWidth = width;
    }

    private static parsesettings(
        dataView: powerbiVisualsApi.DataView,
        jsonFilters,
        colorPalette: powerbiVisualsApi.extensibility.ISandboxExtendedColorPalette,
    ): VisualSettings {
        const settings: VisualSettings = VisualSettings.parse<VisualSettings>(dataView);

        paraTimeline.SETVALIDCALENDARSETTINGS(settings.calendar);

        if (jsonFilters
            && jsonFilters[0]
            && jsonFilters[0].conditions
            && jsonFilters[0].conditions[0]
            && jsonFilters[0].conditions[1]
        ) {
            const startDate: Date = new Date(`${jsonFilters[0].conditions[0].value}`);
            const endDate: Date = new Date(`${jsonFilters[0].conditions[1].value}`);

            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                settings.general.datePeriod = TimelineDatePeriodBase.CREATE(startDate, endDate);
            } else {
                settings.general.datePeriod = TimelineDatePeriodBase.CREATEEMPTY();
            }
        } else {
            settings.general.datePeriod = TimelineDatePeriodBase.CREATEEMPTY();
        }

        if (colorPalette.isHighContrast) {
            const {
                foreground,
                background,
            } = colorPalette;

            settings.rangeHeader.fontColor = foreground.value;

            settings.cells.fillSelected = foreground.value;
            settings.cells.fillUnselected = background.value;
            settings.cells.strokeColor = foreground.value;
            settings.cells.selectedStrokeColor = background.value;

            settings.granularity.scaleColor = foreground.value;
            settings.granularity.sliderColor = foreground.value;

            settings.labels.fontColor = foreground.value;

            settings.cursor.color = foreground.value;
        }

        return settings;
    }

    /**
     * It's public for testability
     */
    public timelineData: ITimelineData;
    public calendar: Calendar;

    private settings: VisualSettings;

    private timelineProperties: ITimelineProperties;

    private timelineGranularityData: TimelineGranularityData;

    private rootSelection: D3Selection<any, any, any, any>;
    private headerSelection: D3Selection<any, any, any, any>;
    private mainSvgSelection: D3Selection<any, any, any, any>;
    private mainSvgWrapperSelection: D3Selection<any, any, any, any>;

    private rangeTextSelection: D3Selection<any, any, any, any>;
    private mainGroupSelection: D3Selection<any, any, any, any>;
    private yearLabelsSelection: D3Selection<any, any, any, any>;
    private quarterLabelsSelection: D3Selection<any, any, any, any>;
    private monthLabelsSelection: D3Selection<any, any, any, any>;
    private weekLabelsSelection: D3Selection<any, any, any, any>;
    private dayLabelsSelection: D3Selection<any, any, any, any>;
    private cellsSelection: D3Selection<any, any, any, any>;
    private cursorGroupSelection: D3Selection<any, any, any, any>;
    private selectorSelection: D3Selection<any, any, any, any>;
    private containerG: D3Selection<any, any, any, any>;

    private options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions;
    private dataView: powerbiVisualsApi.DataView;

    private svgWidth: number;

    private datePeriod: ITimelineDatePeriodBase;
    private prevFilteredStartDate: Date | null = null;
    private prevFilteredEndDate: Date | null = null;

    private initialized: boolean;

    private host: powerbiVisualsApi.extensibility.visual.IVisualHost;

    private locale: string;
    private localizationManager: powerbiVisualsApi.extensibility.ILocalizationManager;
    private horizontalAutoScrollingPositionOffset: number = 200;

    private selectedGranulaPos: number = null;

    private isForceSelectionReset: boolean = false;
    private containerGranularityAndDatePickers;
    private datePickers;
    private timelineSize = 0;

    private selectionManager: ISelectionManager;

    //Datepickers declaration
    private startDatePicker;
    private endDatePicker;

    private cursorDragBehavior = d3Drag<any, ICursorDataPoint>()
        .subject((cursorDataPoint: ICursorDataPoint) => {
            cursorDataPoint.x = cursorDataPoint.selectionIndex * this.timelineProperties.cellWidth;

            return cursorDataPoint;
        })
        .on("drag", this.onCursorDrag.bind(this))
        .on("end", this.onCursorDragEnd.bind(this));

    constructor(options: powerbiVisualsApi.extensibility.visual.VisualConstructorOptions) {
        const element: HTMLElement = options.element;

        this.selectionManager = options.host.createSelectionManager();
        this.host = options.host;

        this.initialized = false;
        this.locale = this.host.locale;

        this.localizationManager = this.host.createLocalizationManager();

        this.timelineProperties = {
            bottomMargin: paraTimeline.TimelineMargins.BottomMargin,
            cellHeight: paraTimeline.TimelineMargins.CellHeight,
            cellWidth: paraTimeline.TimelineMargins.CellWidth,
            cellsYPosition: paraTimeline.TimelineMargins.TopMargin * paraTimeline.CellsYPositionFactor + paraTimeline.CellsYPositionOffset,
            elementWidth: paraTimeline.TimelineMargins.ElementWidth,
            leftMargin: paraTimeline.TimelineMargins.LeftMargin,
            legendHeight: paraTimeline.TimelineMargins.LegendHeight,
            rightMargin: paraTimeline.TimelineMargins.RightMargin,
            startXpoint: paraTimeline.TimelineMargins.StartXpoint,
            startYpoint: paraTimeline.TimelineMargins.StartYpoint,
            textYPosition: paraTimeline.DefaultTextYPosition,
            topMargin: paraTimeline.TimelineMargins.TopMargin,
        };

        //Set the css in order for all elements to appear on the same line
        this.rootSelection = d3Select(element)
            .append("div")
            .classed("timeline-component", true);

        let container = this.rootSelection
            .append("g")
            .attr("float", "left")
            .classed("containerG", true);
        this.containerG = container;
        let firstDiv = container.append("div").classed("firstDiv", true);

        this.headerSelection = firstDiv
            .append("svg")
            .classed("split", true);

        // this.rootSelection
        //     .append("div")
        //     .style("clear", "both");

        this.mainSvgWrapperSelection = this.rootSelection
            .append("div")
            .classed(paraTimeline.TimelineSelectors.TimelineWrapper.className, true);

        this.datePickers = firstDiv
            .append("div")
            .classed("datePickerDiv", true);

        this.datePickers.on("click", () => {
            const event: MouseEvent = (<MouseEvent>require("d3").event);
            event.stopPropagation();
        });

        this.startDatePicker = this.datePickers.append("input")
            .attr("type", "date")
            .classed("dateRange", true)
            .classed("startDate", true);

        this.endDatePicker = this.datePickers.append("input")
            .attr("type", "date")
            .classed("dateRange", true)
            .classed("endDate", true);

        this.mainSvgSelection = this.mainSvgWrapperSelection
            .append("svg")
            .classed(paraTimeline.TimelineSelectors.TimelineVisual.className, true);
        
        let btDiv = container.append("div").classed("btDiv", true);
        let btDiv1 = btDiv.append("div").classed("btDiv1", true);
        let btDiv2 = btDiv.append("div").classed("btDiv2", true);
        let btDiv3 = btDiv.append("div").classed("btDiv2", true);
        let tYear = btDiv1.append("div").classed("fbt", true).append("button").text("This Year").on("click", () => this.setThisYear(this.startDatePicker, this.endDatePicker));
        let tMonth = btDiv1.append("div").classed("fbt", true).append("button").text("This Month").on("click", () => this.setThisMonth(this.startDatePicker, this.endDatePicker));
        let lYear = btDiv2.append("div").classed("fbt", true).append("button").text("Last Year").on("click", () => this.setLastYear(this.startDatePicker, this.endDatePicker));
        let lMonth = btDiv2.append("div").classed("fbt", true).append("button").text("Last Month").on("click", () => this.setLastMonth(this.startDatePicker, this.endDatePicker));
        let reset = btDiv3.append("div").classed("fbt", true).append("button").text("Reset").on("click", () => this.clearUserSelection());

        this.containerGranularityAndDatePickers = container;

        this.addElements();
    }

    public dateToString(now) {
        var day = ("0" + now.getDate()).slice(-2);
        var month = ("0" + (now.getMonth() + 1)).slice(-2);
        return now.getFullYear() + "-" + (month) + "-" + (day);
    }

    public setThisMonth(startDatePicker, endDatePicker) {
        let today = new Date(), year = today.getFullYear(), month = today.getMonth();
        let startDate = new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let endDate = new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let firstDay = new Date(Math.max(new Date(year, month, 1).getTime(), this.datePeriod.startDate.getTime()));
        let lastDay = new Date(Math.min(new Date(year, month + 1, 0).getTime(), this.datePeriod.endDate.getTime()));
        startDatePicker.property("value", this.dateToString(firstDay));
        endDatePicker.property("value", this.dateToString(lastDay));
        this.updateDate(this.startDatePicker, this.endDatePicker)
    }

    public setThisYear(startDatePicker, endDatePicker) {
        let today = new Date(), year = today.getFullYear(), month = today.getMonth();
        let startDate = new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let endDate = new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let firstDay = new Date(Math.max(new Date(year, 0, 1).getTime(), this.datePeriod.startDate.getTime()));
        let lastDay = new Date(Math.min(new Date(year, 11, 31).getTime(), this.datePeriod.endDate.getTime()));
        startDatePicker.property("value", this.dateToString(firstDay));
        endDatePicker.property("value", this.dateToString(lastDay));
        this.updateDate(this.startDatePicker, this.endDatePicker)
    }

    public setLastMonth(startDatePicker, endDatePicker) {
        let today = new Date(), year = today.getFullYear(), month = today.getMonth() - 1;
        let startDate = new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let endDate = new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let firstDay = new Date(Math.max(new Date(year, month, 1).getTime(), this.datePeriod.startDate.getTime()));
        let lastDay = new Date(Math.min(new Date(year, month + 1, 0).getTime(), this.datePeriod.endDate.getTime()));
        startDatePicker.property("value", this.dateToString(firstDay));
        endDatePicker.property("value", this.dateToString(lastDay));
        this.updateDate(this.startDatePicker, this.endDatePicker)
    }

    public setLastYear(startDatePicker, endDatePicker) {
        let today = new Date(), year = today.getFullYear() - 1, month = today.getMonth();
        let startDate = new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let endDate = new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let firstDay = new Date(Math.max(new Date(year, 0, 1).getTime(), this.datePeriod.startDate.getTime()));
        let lastDay = new Date(Math.min(new Date(year, 11, 31).getTime(), this.datePeriod.endDate.getTime()));
        startDatePicker.property("value", this.dateToString(firstDay));
        endDatePicker.property("value", this.dateToString(lastDay));
        this.updateDate(this.startDatePicker, this.endDatePicker)
    }

    public setMTD(startDatePicker, endDatePicker) {
        let today = new Date(), year = today.getFullYear(), month = today.getMonth();
        let startDate = new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let endDate = new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let firstDay = new Date(Math.max(new Date(year, month, 1).getTime(), this.datePeriod.startDate.getTime()));
        let lastDay = new Date(Math.min(today.getTime(), this.datePeriod.endDate.getTime()));
        startDatePicker.property("value", this.dateToString(firstDay));
        endDatePicker.property("value", this.dateToString(lastDay));
    }

    public setYTD(startDatePicker, endDatePicker) {
        let today = new Date(), year = today.getFullYear(), month = today.getMonth();
        let startDate = new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let endDate = new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone}));
        let firstDay = new Date(Math.max(new Date(year, 0, 1).getTime(), this.datePeriod.startDate.getTime()));
        let lastDay = new Date(Math.min(today.getTime(), this.datePeriod.endDate.getTime()));
        startDatePicker.property("value", this.dateToString(firstDay));
        endDatePicker.property("value", this.dateToString(lastDay));
    }

    public clearUserSelection(): void {
        if (!this.initialized || !this.timelineData) {
            return;
        }

        this.clearSelection(this.timelineData.filterColumnTarget);
        this.toggleForceSelectionOptions();
        this.applyDatePeriod(this.datePeriod.startDate, this.datePeriod.endDate, this.timelineData.filterColumnTarget);
    }

    public doesPeriodSlicerRectPositionNeedToUpdate(granularity: GranularityType): boolean {
        const sliderSelection = d3Select("rect.periodSlicerRect");

        if (sliderSelection && sliderSelection.datum() === granularity) {
            return false;
        }

        return true;
    }

    public redrawPeriod(granularity: GranularityType): void {
        if (this.doesPeriodSlicerRectPositionNeedToUpdate(granularity)) {
            const startDate: Date = Utils.GETSTARTSELECTIONDATE(this.timelineData);
            const endDate: Date = Utils.GETENDSELECTIONDATE(this.timelineData);

            this.changeGranularity(granularity, startDate, endDate);
        }
    }


    private updateDate(startDatePicker, endDatePicker) {
        this.applyDatePeriod(
            new Date(new Date(startDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone})),
            new Date(new Date(endDatePicker.node().value).toLocaleString("en-US", {timeZone: paraTimeline.timeZone})),
            this.timelineData.filterColumnTarget,
        );
    }

    public update1() {
        // it contains dates from data view.
        this.datePeriod = this.createDatePeriod(this.dataView);

        //Limit the date period based on the users formatting options
        if (this.settings.limitDateSpan.startDate !== "") {
            let date = new Date(this.settings.limitDateSpan.startDate);

            if (date.toString() !== "Invalid Date" && this.datePeriod.startDate < date) {
                this.datePeriod.startDate = date;
            }
        }

        if (this.settings.limitDateSpan.endDate !== "") {
            let date = new Date(this.settings.limitDateSpan.endDate);

            if (date.toString() !== "Invalid Date" && this.datePeriod.endDate > date) {
                this.datePeriod.endDate = date;
            }
        }

        //change the div's holding the scalers and time slicer based on how many scalers are being showed
        // this.changeDivSizeBasedOnGranularityOptionsShown();

        //Set the value of the date pickers to be that closest and further date available
        let endDateFormatted = this.getDateInDefaultFormat(this.datePeriod.endDate);
        let startDateFormatted = this.getDateInDefaultFormat(this.datePeriod.startDate);

        this.endDatePicker.node().defaultValue = endDateFormatted;
        this.startDatePicker.node().defaultValue = startDateFormatted;

        let startDatePicker = this.startDatePicker;
        let endDatePicker = this.endDatePicker;
        let self = this;

        this.endDatePicker.attr("min", startDateFormatted).attr("max", endDateFormatted);
        this.startDatePicker.attr("min", startDateFormatted).attr("max", endDateFormatted);


        this.timelineProperties.legendHeight = 0;
        if (this.settings.rangeHeader.show) {
            this.timelineProperties.legendHeight = paraTimeline.TimelineMargins.LegendHeightRange;
        }
        if (this.settings.granularity.show) {
            this.timelineProperties.legendHeight = paraTimeline.TimelineMargins.LegendHeight;
        }

        if (!this.initialized) {
            this.timelineData = {
                cursorDataPoints: [],
                timelineDataPoints: [],
            };
        }

        this.headerSelection.attr("height", this.timelineProperties.legendHeight);

        this.timelineGranularityData = new TimelineGranularityData(
            this.datePeriod.startDate,
            this.datePeriod.endDate,
        );

        this.createTimelineData(
            this.settings,
            this.datePeriod.startDate,
            this.datePeriod.endDate,
            this.timelineGranularityData,
            this.locale,
            this.localizationManager,
        );

        this.updateCalendar(this.settings);
    }

    public update2() {
            // It contains date boundaties that was taken from current slicer filter (filter range).
        // If nothing is selected in slicer the boundaries will be null.
        const filterDatePeriod = this.settings.general.datePeriod;

        // There may be the case when date boundaries that taken from data view are less than slicer filter dates.
        // The case may happen if there is another timeline slicer that works with the same data and already applied a filter.
        // In that case we need to correct slice filter dates.
        if (filterDatePeriod["startDate"]
            && this.datePeriod.startDate
            && filterDatePeriod["startDate"].getTime() < this.datePeriod.startDate.getTime()
        ) {
            filterDatePeriod["startDate"] = null;
        }
        // End date from data is always less than date from slicer filter.
        // This means that we need to correct it before check.
        let adaptedDataEndDate: Date = null;
        if (this.datePeriod.endDate) adaptedDataEndDate = new Date(this.datePeriod.endDate), adaptedDataEndDate.setDate(adaptedDataEndDate.getDate() + 1);

        if (filterDatePeriod["endDate"] && adaptedDataEndDate && filterDatePeriod["endDate"].getTime() > adaptedDataEndDate.getTime()) filterDatePeriod["endDate"] = null;

        const datePeriod: ITimelineDatePeriodBase = this.datePeriod;
        const granularity = this.settings.granularity.granularity;
        const isCurrentPeriodSelected: boolean = !this.isForceSelectionReset && this.settings.forceSelection.currentPeriod;
        const isLatestAvailableDateSelected: boolean = !this.isForceSelectionReset && this.settings.forceSelection.latestAvailableDate;
        const isForceSelected: boolean = !this.isForceSelectionReset && (isCurrentPeriodSelected || isLatestAvailableDateSelected);
        this.isForceSelectionReset = false; // Reset it to default state to allow re-enabling Force Selection
        const target: IFilterColumnTarget = this.timelineData.filterColumnTarget;
        let currentForceSelectionResult = { startDate: null, endDate: null };

        if (isCurrentPeriodSelected) currentForceSelectionResult = ({endDate: filterDatePeriod["endDate"], startDate: filterDatePeriod["startDate"],} = paraTimeline.SELECTCURRENTPERIOD(datePeriod, granularity, this.calendar));
        if (isLatestAvailableDateSelected && (!isCurrentPeriodSelected || (isCurrentPeriodSelected && !currentForceSelectionResult.startDate && !currentForceSelectionResult.endDate))) {
            filterDatePeriod["endDate"] = adaptedDataEndDate;
            ({endDate: filterDatePeriod["endDate"], startDate: filterDatePeriod["startDate"], } = paraTimeline.SELECTPRIOD1(datePeriod, granularity, this.calendar, this.datePeriod.endDate));
        }

        const wasFilterChanged: boolean =
            String(this.prevFilteredStartDate) !== String(filterDatePeriod["startDate"]) ||
            String(this.prevFilteredEndDate) !== String(filterDatePeriod["endDate"]);

        if (isForceSelected && wasFilterChanged) {
            this.applyDatePeriod(filterDatePeriod["startDate"], filterDatePeriod["endDate"], target);
        }

        //Set the value of the date pickers to be that closest and further date available
        if (filterDatePeriod && filterDatePeriod["startDate"] && filterDatePeriod["endDate"]) {
            this.endDatePicker.node().value = this.getDateInDefaultFormat(filterDatePeriod["endDate"]);
            this.startDatePicker.node().value = this.getDateInDefaultFormat(filterDatePeriod["startDate"]);
        } else {
            this.startDatePicker.node().value = this.startDatePicker.node().defaultValue;
            this.endDatePicker.node().value = this.endDatePicker.node().defaultValue;
        }

        this.prevFilteredStartDate = filterDatePeriod["startDate"], this.prevFilteredEndDate = filterDatePeriod["endDate"];

        if (!this.initialized) this.initialized = true;

        if (filterDatePeriod["startDate"] && filterDatePeriod["endDate"]) {
            this.changeGranularity(
                this.settings.granularity.granularity,
                filterDatePeriod["startDate"],
                filterDatePeriod["endDate"]);
            this.updateCalendar(this.settings);
        }

        const startXpoint: number = this.timelineProperties.startXpoint;
        const elementWidth: number = this.timelineProperties.elementWidth;

        d3SelectAll("g." + paraTimeline.TimelineSelectors.TimelineSlicer.className).remove();

        if (this.settings.granularity.show) {
            this.selectorSelection = this.headerSelection
                .append("g")
                .classed(paraTimeline.TimelineSelectors.TimelineSlicer.className, true);

            this.timelineGranularityData.renderGranularities({
                granularSettings: this.settings.granularity,
                selectPeriodCallback: (granularityType: GranularityType) => { this.selectPeroid(granularityType); },
                selection: this.selectorSelection,
            });

            if (this.granularityShownCount() === 4) {
                // create selected period text
                this.selectorSelection
                    .append("text")
                    .attr("fill", this.settings.granularity.scaleColor)
                    .classed(paraTimeline.TimelineSelectors.PeriodSlicerSelection.className, true)
                    .text(this.localizationManager.getDisplayName(Utils.GETGRANULARITYNAMEKEY(granularity)))
                    .attr("x", pixelConverter.toString(startXpoint + paraTimeline.SelectedTextSelectionFactor * elementWidth))
                    .attr("y", pixelConverter.toString(paraTimeline.SelectedTextSelectionYOffset));
            }
        }
    }

    public update(options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions): void {
        if (!paraTimeline.AREVISUALUPDATEOPTIONSVALID(options)) {
            this.clearData();
            return;
        }

        this.options = options;
        this.dataView = options.dataViews[0];

        // Setting parsing was moved here from createTimelineData because settings values may be modified before the function is called.
        this.settings = paraTimeline.parsesettings(
            this.dataView,
            this.options.jsonFilters,
            this.host.colorPalette,
        );

        this.update1();
        this.update2();

        this.render(
            this.timelineData,
            this.settings,
            this.timelineProperties,
            options,
        );

        //Bring foward the container containing the labels
        d3Select(".lastId")
            .each(function (d, i) {
                (this)["parentNode"].parentNode.appendChild((this)["parentNode"]);
            });
    }

    private changeDivSizeBasedOnGranularityOptionsShown() {
        let granularityShown = this.granularityShownCount();

        let granularityPercentage = granularityShown / 5;

        this.timelineSize = (78 + (13.2 * (1 - granularityPercentage)));

        this.mainSvgWrapperSelection.style("width", this.timelineSize + "%");
        this.containerGranularityAndDatePickers.style("width", (7.8 + (13.2 * granularityPercentage)) + "%");

        this.datePickers.style("width", (38 + (50 * (1 - granularityPercentage))) + "%");
        this.headerSelection.style("width", 10 + (50 * granularityPercentage) + "%");

        this.timelineSize = this.timelineSize / 100;

        this.mainSvgWrapperSelection.style("width", "100%");
        this.containerGranularityAndDatePickers.style("width", "100%").style("height", "auto");
    }

    private granularityShownCount() {
        let count = 0;

        if (this.settings.granularity.granularityDayVisibility === true)
            count++;

        if (this.settings.granularity.granularityMonthVisibility === true)
            count++;

        if (this.settings.granularity.granularityQuarterVisibility === true)
            count++;

        if (this.settings.granularity.granularityWeekVisibility === true)
            count++;

        if (this.settings.granularity.granularityYearVisibility === true)
            count++;

        return count;
    }

    public fillCells(visSettings: VisualSettings): void {
        const dataPoints: ITimelineDataPoint[] = this.timelineData.timelineDataPoints;

        const cellSelection: D3Selection<any, ITimelineDataPoint, any, any> = this.mainGroupSelection
            .selectAll(paraTimeline.TimelineSelectors.CellRect.selectorName)
            .data(dataPoints);

        const cellsSettings: CellsSettings = visSettings.cells;

        let singleCaseDone: boolean = false;

        cellSelection
            .attr("fill", (dataPoint: ITimelineDataPoint, index: number) => {
                const isSelected: boolean = Utils.ISGRANULESELECTED(dataPoint, this.timelineData, cellsSettings);

                if (visSettings.scrollAutoAdjustment.show && isSelected && !singleCaseDone) {
                    const selectedGranulaPos: number = (cellSelection.nodes()[index]).x.baseVal.value;
                    this.selectedGranulaPos = selectedGranulaPos;
                    singleCaseDone = true;
                }

                return isSelected
                    ? cellsSettings.fillSelected
                    : (cellsSettings.fillUnselected || Utils.DefaultCellColor);
            })
            .style("stroke", (dataPoint: ITimelineDataPoint) => {
                const isSelected: boolean = Utils.ISGRANULESELECTED(dataPoint, this.timelineData, cellsSettings);

                return isSelected
                    ? cellsSettings.selectedStrokeColor
                    : cellsSettings.strokeColor;
            });
    }

    public renderCells(timelineData: ITimelineData, timelineProperties: ITimelineProperties, yPos: number): void {
        const dataPoints: ITimelineDataPoint[] = timelineData.timelineDataPoints;

        let totalX: number = 0;

        const cellsSelection: D3Selection<any, ITimelineDataPoint, any, any> = this.cellsSelection
            .selectAll(paraTimeline.TimelineSelectors.CellRect.selectorName)
            .data(dataPoints);

        d3SelectAll(`rect.${paraTimeline.TimelineSelectors.CellRect.className} title`).remove();

        cellsSelection
            .exit()
            .remove();

        cellsSelection
            .enter()
            .append("rect")
            .classed(paraTimeline.TimelineSelectors.CellRect.className, true)
            .on("click", this.handleClick.bind(this))
            .on("touchstart", this.handleClick.bind(this))
            .merge(cellsSelection)
            .attr("x", (dataPoint: ITimelineDataPoint) => {
                const position: number = totalX;

                totalX += dataPoint.datePeriod.fraction * timelineProperties.cellWidth;

                return pixelConverter.toString(position);
            })
            .attr("y", pixelConverter.toString(yPos))
            .attr("height", pixelConverter.toString(timelineProperties.cellHeight))
            .attr("width", (dataPoint: ITimelineDataPoint) => {
                return pixelConverter.toString(dataPoint.datePeriod.fraction * timelineProperties.cellWidth);
            })
            .append("title")
            .text((dataPoint: ITimelineDataPoint) => timelineData.currentGranularity.generateLabel(dataPoint.datePeriod).title);

        this.fillCells(this.settings);
    }

    public renderCursors(
        timelineData: ITimelineData,
        cellHeight: number,
        cellsYPosition: number,
    ): D3Selection<any, any, any, any> {
        const cursorSelection: D3Selection<any, ICursorDataPoint, any, any> = this.cursorGroupSelection
            .selectAll(paraTimeline.TimelineSelectors.SelectionCursor.selectorName)
            .data(timelineData.cursorDataPoints);

        cursorSelection
            .exit()
            .remove();

        return cursorSelection
            .enter()
            .append("path")
            .classed(paraTimeline.TimelineSelectors.SelectionCursor.className, true)
            .merge(cursorSelection)
            .attr("transform", (cursorDataPoint: ICursorDataPoint) => {
                const dx: number = cursorDataPoint.selectionIndex * this.timelineProperties.cellWidth;
                const dy: number = cellHeight / paraTimeline.CellHeightDivider + cellsYPosition;

                return svgManipulation.translate(dx, dy);
            })
            .attr("d", d3Arc<ICursorDataPoint>()
                .innerRadius(0)
                .outerRadius(cellHeight / paraTimeline.CellHeightDivider)
                .startAngle((cursorDataPoint: ICursorDataPoint) => {
                    return cursorDataPoint.cursorIndex * Math.PI + Math.PI;
                })
                .endAngle((cursorDataPoint: ICursorDataPoint) => {
                    return cursorDataPoint.cursorIndex * Math.PI + 2 * Math.PI;
                }),
            )
            .style("fill", this.settings.cursor.color)
            .call(this.cursorDragBehavior);
    }

    public renderTIMERANGETEXT(timelineData: ITimelineData, rangeHeaderSettings: LabelsSettings): void {
        const leftMargin: number = (GranularityNames.length + paraTimeline.GranularityNamesLength)
            * this.timelineProperties.elementWidth;

        const maxWidth: number = this.svgWidth
            - leftMargin
            - this.timelineProperties.leftMargin
            - rangeHeaderSettings.textSize;

        d3SelectAll("g." + paraTimeline.TimelineSelectors.RangeTextArea.className).remove();

        if (rangeHeaderSettings.show && maxWidth > 0) {
            this.rangeTextSelection = this.headerSelection
                .append("g")
                .classed(paraTimeline.TimelineSelectors.RangeTextArea.className, true)
                .append("text");

            const timeRangeText: string = Utils.TIMERANGETEXT(timelineData);

            const labelFormattedTextOptions: dataLabelInterfaces.LabelFormattedTextOptions = {
                fontSize: rangeHeaderSettings.textSize,
                label: timeRangeText,
                maxWidth,
            };

            const actualText: string = dataLabelUtils.getLabelFormattedText(labelFormattedTextOptions);

            const positionOffset: number = paraTimeline.TimelineMargins.LegendHeight - this.timelineProperties.legendHeight;
            this.rangeTextSelection
                .classed(paraTimeline.TimelineSelectors.SelectionRangeContainer.className, true)

                // .attr("x", GranularityNames.length
                //     * (this.timelineProperties.elementWidth + this.timelineProperties.leftMargin))
                .attr("x", 15)
                .attr("y", paraTimeline.DefaultRangeTextSelectionY - positionOffset)
                .attr("fill", rangeHeaderSettings.fontColor)
                .style("font-size", pixelConverter.fromPointToPixel(rangeHeaderSettings.textSize))
                .text(actualText)
                .append("title")
                .text(timeRangeText);
        }
    }

    public setSelection(timelineData: ITimelineData): void {
        if (Utils.AREBOUNDSOFSELECTIONANDAVAILABLEDATESTHESAME(timelineData)) {
            this.clearSelection(timelineData.filterColumnTarget);
            return;
        }

        this.applyDatePeriod(
            Utils.GETSTARTSELECTIONDATE(timelineData),
            Utils.GETENDSELECTIONDATE(timelineData),
            timelineData.filterColumnTarget,
        );
    }

    public applyDatePeriod(
        startDate: Date,
        endDate: Date,
        target: IFilterColumnTarget,
    ): void {
        this.host.applyJsonFilter(
            this.createFilter(startDate, endDate, target),
            paraTimeline.filterObjectProperty.objectName,
            paraTimeline.filterObjectProperty.propertyName,
            this.getFilterAction(startDate, endDate),
        );
    }

    public getFilterAction(startDate: Date, endDate: Date): powerbiVisualsApi.FilterAction {
        return startDate !== undefined
            && endDate !== undefined
            && startDate !== null
            && endDate !== null
            ? powerbiVisualsApi.FilterAction.merge
            : powerbiVisualsApi.FilterAction.remove;
    }

    /**
     * Changes the current granularity depending on the given granularity type
     * Separates the new granularity's date periods which contain the start/end selection
     * Unseparates the date periods of the previous granularity.
     * @param granularity The new granularity type
     */
    public changeGranularity(granularity: GranularityType, startDate: Date, endDate: Date): void {
        Utils.UNSEPARATESELECTION(this.timelineData.currentGranularity.getDatePeriods());

        this.timelineData.currentGranularity = this.timelineGranularityData.getGranularity(granularity);
        Utils.SEPARATESELECTION(this.timelineData, startDate, endDate);
    }

    public createFilter(startDate: Date, endDate: Date, target: IFilterColumnTarget): AdvancedFilter {
        if (startDate == null || endDate == null || !target) {
            return null;
        }

        return new AdvancedFilter(
            target,
            "And",
            {
                operator: "GreaterThanOrEqual",
                value: startDate.toJSON(),
            },
            {
                operator: "LessThan",
                value: endDate.toJSON(),
            },
        );
    }

    public clearSelection(target: IFilterColumnTarget): void {
        this.prevFilteredStartDate = null;
        this.prevFilteredEndDate = null;

        this.applyDatePeriod(null, null, target);
    }

    /**
     * This function returns the values to be displayed in the property pane for each object.
     * Usually it is a bind pass of what the property pane gave you, but sometimes you may want to do
     * validation and return other values/defaults.
     */
    public enumerateObjectInstances(options: powerbiVisualsApi.EnumerateVisualObjectInstancesOptions): powerbiVisualsApi.VisualObjectInstanceEnumeration {
        if (options.objectName === "general") {
            return [];
        }

        const settings = this.settings || VisualSettings.getDefault();

        const instancesEnumerator: powerbiVisualsApi.VisualObjectInstanceEnumeration = VisualSettings.enumerateObjectInstances(
            settings,
            options,
        );

        const instances = (instancesEnumerator)["instances"]
            ? (instancesEnumerator)["instances"]
            : instancesEnumerator;

        if (options.objectName === "weekDay"
            && !settings["weekDay"].daySelection
            && instances
            && instances[0]
            && instances[0].properties
        ) {
            delete instances[0].properties.day;
        }

        return instances;
    }

    public selectPeroid(granularityType: GranularityType): void {
        if (this.timelineData.currentGranularity.getType() === granularityType) {
            return;
        }

        this.host.persistProperties({
            merge: [{
                objectName: "granularity",
                properties: { granularity: granularityType },
                selector: null,
            }],
        });

        this.settings.granularity.granularity = granularityType;
    }

    public onCursorDrag(currentCursor: ICursorDataPoint): void {
        const cursorOverElement: ITimelineCursorOverElement = this.findCursorOverElement(((<MouseEvent>require("d3").event)).x);

        if (!cursorOverElement) {
            return;
        }

        const currentlyMouseOverElement: ITimelineDataPoint = cursorOverElement.datapoint;
        const currentlyMouseOverElementIndex: number = cursorOverElement.index;

        if (currentCursor.cursorIndex === 0 && currentlyMouseOverElementIndex <= this.timelineData.selectionEndIndex) {
            this.timelineData.selectionStartIndex = currentlyMouseOverElementIndex;
            this.timelineData.cursorDataPoints[0].selectionIndex = currentlyMouseOverElement.datePeriod.index;
        }

        if (currentCursor.cursorIndex === 1 && currentlyMouseOverElementIndex >= this.timelineData.selectionStartIndex) {
            this.timelineData.selectionEndIndex = currentlyMouseOverElementIndex;

            this.timelineData.cursorDataPoints[1].selectionIndex =
                currentlyMouseOverElement.datePeriod.index + currentlyMouseOverElement.datePeriod.fraction;
        }

        this.fillCells(this.settings);

        this.renderCursors(
            this.timelineData,
            this.timelineProperties.cellHeight,
            this.timelineProperties.cellsYPosition);

        this.renderTIMERANGETEXT(this.timelineData, this.settings.rangeHeader);
    }

    /**
     * Note: Public for testability.
     */
    public findCursorOverElement(position: number): ITimelineCursorOverElement {
        const timelineDatapoints: ITimelineDataPoint[] = this.timelineData.timelineDataPoints || [];
        const cellWidth: number = this.timelineProperties.cellWidth;

        const timelineDatapointIndexes: number[] = timelineDatapoints.map((datapoint: ITimelineDataPoint) => {
            return datapoint.index;
        });

        const index: number = Utils.GETINDEXBYPOSITION(
            timelineDatapointIndexes,
            cellWidth,
            position);

        if (!timelineDatapoints[index]) {
            return null;
        }

        return {
            datapoint: timelineDatapoints[index],
            index,
        };
    }

    public onCursorDragEnd(): void {
        this.setSelection(this.timelineData);
        this.toggleForceSelectionOptions();
    }

    private handleClick(dataPoint: ITimelineDataPoint, index: number): void {
        const event: MouseEvent = (<MouseEvent>require("d3").event);

        event.stopPropagation();

        this.onCellClickHandler(dataPoint, index, event.altKey || event.shiftKey);
    }

    private addElements(): void {
        this.mainGroupSelection = this.mainSvgSelection
            .append("g")
            .classed(paraTimeline.TimelineSelectors.MainArea.className, true);

        this.yearLabelsSelection = this.mainGroupSelection.append("g");
        this.quarterLabelsSelection = this.mainGroupSelection.append("g");
        this.monthLabelsSelection = this.mainGroupSelection.append("g");
        this.weekLabelsSelection = this.mainGroupSelection.append("g");
        this.dayLabelsSelection = this.mainGroupSelection.append("g");

        this.cellsSelection = this.mainGroupSelection
            .append("g")
            .classed(paraTimeline.TimelineSelectors.CellsArea.className, true);

        this.cursorGroupSelection = this.mainSvgSelection
            .append("g")
            .classed(paraTimeline.TimelineSelectors.CursorsArea.className, true);
    }

    private createDatePeriod(dataView: powerbiVisualsApi.DataView): ITimelineDatePeriodBase {
        return Utils.GETDATEPRIOD(dataView.categorical.categories[0].values);
    }

    private createTimelineData(
        timelineSettings: VisualSettings,
        startDate: Date,
        endDate: Date,
        timelineGranularityData: TimelineGranularityData,
        locale: string,
        localizationManager: powerbiVisualsApi.extensibility.ILocalizationManager,
    ) {
        const calendar = new Calendar(timelineSettings.calendar, timelineSettings.weekDay);

        timelineGranularityData.createGranularities(calendar, locale, localizationManager);
        timelineGranularityData.createLabels();

        if (this.initialized) {
            const actualEndDate: Date = TimelineGranularityData.NEXTDAY(endDate);

            const daysPeriods: ITimelineDatePeriod[] = this.timelineGranularityData
                .getGranularity(GranularityType.day)
                .getDatePeriods();

            const prevStartDate: Date = daysPeriods[0].startDate;

            const prevEndDate: Date = daysPeriods[daysPeriods.length - 1].endDate;

            const changedSelection: boolean =
                startDate.getTime() !== prevStartDate.getTime()
                ||
                actualEndDate.getTime() !== prevEndDate.getTime();

            if (!changedSelection) {
                this.changeGranularity(
                    this.settings.granularity.granularity,
                    startDate,
                    actualEndDate,
                );
            } else {
                this.initialized = false;
            }
        }
    }

    private updateCalendar(timelineFormat: VisualSettings): void {
        this.calendar = paraTimeline.CONVERTER(
            this.timelineData,
            this.timelineProperties,
            this.timelineGranularityData,
            this.options.dataViews[0],
            this.initialized,
            timelineFormat,
            this.options.viewport,
            this.calendar,
            this.settings,
            this.timelineSize
        );
    }

    public render1(
        timelineData: ITimelineData,
        timelineSettings: VisualSettings,
        timelineProperties: ITimelineProperties,
        options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions,
    ) {
        //Removes all of the lines from the svg before drawing new ones
        d3SelectAll(".lineAxis").remove();

        const timelineDatapointsCount = this.timelineData.timelineDataPoints
            .filter((dataPoint: ITimelineDataPoint) => {
                return dataPoint.index % 1 === 0;
            })
            .length;

        this.svgWidth = paraTimeline.SvgWidthOffset
            + this.timelineProperties.cellHeight
            + timelineProperties.cellWidth * timelineDatapointsCount;

        this.renderTIMERANGETEXT(timelineData, timelineSettings.rangeHeader);

        this.rootSelection
            .attr("drag-resize-disabled", true)
            .style("overflow-x", paraTimeline.DefaultOverflow)
            .style("overflow-y", "auto")
            .style("height", pixelConverter.toString(options.viewport.height))
            .style("width", pixelConverter.toString(options.viewport.width));

        const mainAreaHeight: number = timelineProperties.cellsYPosition - paraTimeline.TimelineMargins.LegendHeight
            + timelineProperties.cellHeight;

        const mainHeight = timelineProperties.cellHeight + paraTimeline.TimelineMargins.TopMargin + paraTimeline.TimelineMargins.LegendHeightOffset + paraTimeline.TimelineMargins.LegendHeight;

        const mainSvgHeight: number = paraTimeline.TimelineMargins.TopMargin + paraTimeline.TimelineMargins.LegendHeightOffset
            + mainHeight;
        let height = pixelConverter.toString(Math.max(paraTimeline.MinSizeOfViewport, mainSvgHeight));
        this.mainSvgWrapperSelection.style("height", mainHeight + "px");
        this.mainSvgSelection
            .attr("height", height)
            .attr("width", this.svgWidth < options.viewport.width / 2
                ? "100%"
                : pixelConverter.toString(Math.max(
                    paraTimeline.MinSizeOfViewport,
                    this.svgWidth,
                )),
            );
        let leftSpace = options.viewport.width - this.containerG.node().getBoundingClientRect().width - 30;
        this.mainSvgWrapperSelection.style("width", this.svgWidth < leftSpace ? this.svgWidth + "px" : leftSpace + "px");

        const fixedTranslateString: string = svgManipulation.translate(
            0,
            timelineProperties.topMargin + this.timelineProperties.startYpoint,
        );

        // Here still paraTimeline.TimelineMargins.LegendHeight is used because it always must have permanent negative offset.
        const translateString: string = svgManipulation.translate(
            timelineProperties.cellHeight / paraTimeline.CellHeightDivider,
            timelineProperties.topMargin - (paraTimeline.TimelineMargins.LegendHeight - paraTimeline.TimelineMargins.LegendHeightOffset),
        );

        this.mainGroupSelection.attr("transform", translateString);

        if (this.selectorSelection) {
            this.selectorSelection.attr("transform", fixedTranslateString);
        }

        this.cursorGroupSelection.attr("transform", translateString);
    }

    public render2(
        timelineData: ITimelineData,
        timelineSettings: VisualSettings,
        timelineProperties: ITimelineProperties,
        options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions,
    ) {
        const extendedLabels = this.timelineData.currentGranularity.getExtendedLabel();
        const granularityType = this.timelineData.currentGranularity.getType();

        let yPos: number = 0;
        const yDiff: number = paraTimeline.DefaultYDiff;

        // Removing currently displayed labels
        this.mainGroupSelection
            .selectAll(paraTimeline.TimelineSelectors.TextLabel.selectorName)
            .remove();

        if (timelineSettings.labels.show) {
            let lastIndex = 0, lastId = -1;
            if (granularityType === GranularityType.day) lastIndex = extendedLabels.dayLabels.length;
            else if (granularityType === GranularityType.month) lastIndex = extendedLabels.monthLabels.length;
            else if (granularityType === GranularityType.quarter) lastIndex = extendedLabels.quarterLabels.length;
            else if (granularityType === GranularityType.week) lastIndex = extendedLabels.weekLabels.length;
            else if (granularityType === GranularityType.year) lastIndex = extendedLabels.yearLabels.length;

            if ((timelineSettings.labels.displayAll && granularityType !== GranularityType.day) || granularityType === GranularityType.year) {
                let y = 0;

                if (granularityType === GranularityType.year) {
                    yPos++;
                    y = this.calculateYOffset(yPos + 1) + timelineProperties.cellHeight / 2;
                } else {
                    y = this.calculateYOffset(yPos + 1.5);
                    lastId = extendedLabels.yearLabels[extendedLabels.yearLabels.length - 1].id;
                }
                this.renderLabels(extendedLabels.yearLabels, this.yearLabelsSelection, y, granularityType === 0, yPos + 1, lastIndex, lastId);
                lastId = -1;
                if (granularityType >= GranularityType.year) yPos += yDiff;
            }

            if (granularityType === GranularityType.quarter) {
                this.renderLabels(
                    extendedLabels.quarterLabels,
                    this.quarterLabelsSelection,
                    this.calculateYOffset(yPos + 1) + timelineProperties.cellHeight / 2,
                    granularityType === 1,
                    yPos + 1,
                    lastIndex);
                if (granularityType >= GranularityType.quarter) yPos += yDiff;
            }

            if ((timelineSettings.labels.displayAll && granularityType === GranularityType.day) || granularityType === GranularityType.month) {
                let y = 0, labels = extendedLabels.monthLabels;
                if (granularityType === GranularityType.month) {
                    y = this.calculateYOffset(yPos + 1) + timelineProperties.cellHeight / 2;
                } else {
                    y = this.calculateYOffset(yPos + 1.5);
                    //Change the label text to be the title so that it is more precise
                    labels = extendedLabels.monthLabels.map(x => {
                        x.text = x.title;
                        return x;
                    });
                    lastId = extendedLabels.monthLabels[extendedLabels.monthLabels.length - 1].id;
                }

                this.renderLabels(labels, this.monthLabelsSelection, y, granularityType === 2, yPos + 1, lastIndex, lastId);
                if (granularityType >= GranularityType.month) yPos += yDiff;
            }

            if (granularityType === GranularityType.week) {
                this.renderLabels(
                    extendedLabels.weekLabels,
                    this.weekLabelsSelection,
                    this.calculateYOffset(yPos + 1) + timelineProperties.cellHeight / 2,
                    granularityType === 3,
                    yPos + 1,
                    lastIndex);
                if (granularityType >= GranularityType.week) yPos += yDiff;
            }

            if (granularityType === GranularityType.day) {
                this.renderLabels(
                    extendedLabels.dayLabels,
                    this.dayLabelsSelection,
                    this.calculateYOffset(yPos + 1) + timelineProperties.cellHeight / 2,
                    granularityType === 4,
                    yPos + 1,
                    lastIndex);
                if (granularityType >= GranularityType.day) yPos += yDiff;
            }
        }
        return yPos;
    }

    public setContextMenu(options) {
        let dataView = options.dataViews[0], categorical = dataView.categorical;
        let cat = categorical.categories[0];
        let identity = this.host.createSelectionIdBuilder().withCategory(cat, 0).createSelectionId();
        let selectionIdOptions = [{
            identity: identity,
            selected: false
        }];
        this.rootSelection.data(selectionIdOptions);
        this.getContextMenu(this.rootSelection, this.selectionManager);
    }

    private render(
        timelineData: ITimelineData,
        timelineSettings: VisualSettings,
        timelineProperties: ITimelineProperties,
        options: powerbiVisualsApi.extensibility.visual.VisualUpdateOptions,
    ): void {
        
        this.render1(timelineData, timelineSettings, timelineProperties, options);
        let yPos = this.render2(timelineData, timelineSettings, timelineProperties, options);

        yPos -= 1;
        this.timelineProperties.cellsYPosition = this.calculateYOffset(yPos);

        this.renderCells(
            timelineData,
            timelineProperties,
            this.calculateYOffset(yPos),
        )

        this.renderCursors(
            timelineData,
            timelineProperties.cellHeight,
            this.timelineProperties.cellsYPosition,
        );

        this.scrollAutoFocusFunc(this.selectedGranulaPos);
        this.setContextMenu(options);
    }

    private calculateYOffset(index: number): number {
        if (!this.settings.labels.show) {
            return this.timelineProperties.textYPosition;
        }

        return this.timelineProperties.textYPosition
            + (index) * pixelConverter.fromPointToPixel(this.settings.labels.textSize);
    }

    private renderLabels(
        labels: ITimelineLabel[],
        labelsElement: D3Selection<any, any, any, any>,
        yPosition: number,
        isLast: boolean,
        yIndex: number,
        lastIndex: number,
        lastId = -1
    ): void {
        const labelTextSelection: D3Selection<any, ITimelineLabel, any, any> = labelsElement
            .selectAll(paraTimeline.TimelineSelectors.TextLabel.selectorName);

        if (!this.settings.labels.show) {
            labelTextSelection.remove();
            return;
        }

        let diffBetweenId = 0;
        let averageOfDiff = 0;

        if (labels.length > 1 && !isLast) {
            //Get the number of cells between each label - 0.5 since it takes up one spot
            diffBetweenId = (labels[1].id - labels[0].id);
            averageOfDiff = (diffBetweenId / 2) - 0.5;
        }

        const labelsGroupSelection: D3Selection<any, ITimelineLabel, any, any> = labelTextSelection.data(labels);
        const fontSize: string = pixelConverter.fromPoint(this.settings.labels.textSize);

        labelsGroupSelection
            .enter()
            .append("text")
            .classed(paraTimeline.TimelineSelectors.TextLabel.className, true)
            .classed("lastId", isLast)
            .merge(labelsGroupSelection)
            .text((label: ITimelineLabel, id: number) => {
                if (!isLast && id === 0 && labels.length > 1) {
                    let textProperties = {
                        fontFamily: paraTimeline.DefaultFontFamily,
                        fontSize,
                        text: labels[0].text,
                    };

                    const halfFirstTextWidth = textMeasurementService.measureSvgTextWidth(textProperties)
                        / paraTimeline.TextWidthMiddleDivider;

                    textProperties = {
                        fontFamily: paraTimeline.DefaultFontFamily,
                        fontSize,
                        text: labels[1].text,
                    };

                    const halfSecondTextWidth = textMeasurementService.measureSvgTextWidth(textProperties)
                        / paraTimeline.TextWidthMiddleDivider;

                    const diff: number = this.timelineProperties.cellWidth
                        * (labels[1].id - labels[0].id);

                    if (diff < halfFirstTextWidth + halfSecondTextWidth) {
                        return "";
                    }
                }

                const labelFormattedTextOptions: dataLabelInterfaces.LabelFormattedTextOptions = {
                    fontSize: this.settings.labels.textSize,
                    label: label.text,
                    maxWidth: this.timelineProperties.cellWidth * (isLast
                        ? paraTimeline.CellWidthLastFactor
                        : paraTimeline.CellWidthNotLastFactor
                    ),
                };

                return dataLabelUtils.getLabelFormattedText(labelFormattedTextOptions);
            })
            .style("font-size", pixelConverter.fromPoint(this.settings.labels.textSize))
            .attr("x", (label: ITimelineLabel) => {
                if (label.id === lastId)
                    return (label.id + ((lastIndex - label.id) / 2) + paraTimeline.LabelIdOffset - 0.5) * this.timelineProperties.cellWidth;

                return (label.id + averageOfDiff + paraTimeline.LabelIdOffset) * this.timelineProperties.cellWidth;
            })
            .attr("y", yPosition)
            .attr("fill", this.settings.labels.fontColor)
            .attr("id", (label: ITimelineLabel) => "id" + label.id)
            .append("title")
            .text((label: ITimelineLabel) => label.title);

        labelsGroupSelection
            .exit()
            .remove();

        this.drawAxisLinesAboveTimeline(labels, labelsElement, yIndex, isLast, averageOfDiff, diffBetweenId, lastIndex);
    }


    private drawAxisLinesAboveTimeline(labels, labelsElement, yIndex, isLast, averageOfDiff, diffBetweenId, lastIndex) {
        //Draw the lines to help demontrate the years
        if (!isLast) {
            let i = 0;
            let y1 = this.calculateYOffset(yIndex);
            let y2 = this.calculateYOffset(yIndex + 1);
            let averageY = (y1 * 0.75 + y2 * 0.25);
            let lengthOfText = this.getLengthOfText(labels[i].id);

            for (i; i < labels.length; i++) {
                // Draw vertical line to show start of one year and the end of another
                let x = labels[i].id * this.timelineProperties.cellWidth;
                let middleOfLine = 0;

                if (i !== labels.length - 1) {
                    middleOfLine = (labels[i].id + averageOfDiff + paraTimeline.LabelIdOffset) * this.timelineProperties.cellWidth;
                } else {
                    const cellsLeft = lastIndex - labels[i].id;
                    diffBetweenId = cellsLeft;

                    middleOfLine = (labels[i].id + (cellsLeft / 2) + paraTimeline.LabelIdOffset - 0.5) * this.timelineProperties.cellWidth;
                }

                this.drawLine(labelsElement, x, x, y1, y2, "black");

                // Draw the horizontal lines between the vertical ones
                this.drawLine(labelsElement, x, middleOfLine - lengthOfText, averageY, averageY, "black");
                this.drawLine(labelsElement, middleOfLine + lengthOfText, (labels[i].id + diffBetweenId) * this.timelineProperties.cellWidth, averageY, averageY, "black");
            }

            // Draw the final vertical line
            const x = lastIndex * this.timelineProperties.cellWidth;
            this.drawLine(labelsElement, x, x, y1, y2, "black");
        }
    }

    private getContextMenu(svg, selection) {
        svg.on('contextmenu', () => {
            const mouseEvent: MouseEvent = (<MouseEvent>d3.event);
            let dataPoint = d3.select(d3.event["currentTarget"]).datum();
            selection.showContextMenu(dataPoint? dataPoint["identity"] : {}, {
                x: mouseEvent.clientX,
                y: mouseEvent.clientY
            });
            mouseEvent.preventDefault();
        }); 
    }

    private getLengthOfText(id) {
        let s = d3.select("#id" + id), text = s.text(), title = s.select("title").text(), t = text.replace(title, "");
        let textProperties = {text: t, fontFamily: "default", fontSize: s.attr("fontSize") + "px", fontWeight: "normal"}, rate = 9 / 12;
        return textMeasurementService.measureSvgTextWidth(textProperties) * 0.65;
    }

    private drawLine(container, x1, x2, y1, y2, strokeColor) {
        container.append("line")
            .attr("x1", x1)
            .attr("x2", x2)
            .attr("y1", y1)
            .attr("y2", y2)
            .classed("lineAxis", true)
            .style("stroke", strokeColor);
    }

    private clearData(): void {
        this.initialized = false;

        this.mainGroupSelection
            .selectAll(paraTimeline.TimelineSelectors.CellRect.selectorName)
            .remove();

        this.mainGroupSelection
            .selectAll(paraTimeline.TimelineSelectors.TextLabel.selectorName)
            .remove();

        this.cursorGroupSelection
            .selectAll(paraTimeline.TimelineSelectors.SelectionCursor.selectorName)
            .remove();

        this.mainSvgSelection
            .selectAll(paraTimeline.TimelineSelectors.RangeTextArea.selectorName)
            .remove();

        this.mainSvgSelection
            .attr("width", 0)
            .selectAll(paraTimeline.TimelineSelectors.TimelineSlicer.selectorName)
            .remove();
    }

    private onCellClickHandler(
        dataPoint: ITimelineDataPoint,
        index: number,
        isMultiSelection: boolean,
    ): void {

        const timelineData: ITimelineData = this.timelineData;
        const cursorDataPoints: ICursorDataPoint[] = timelineData.cursorDataPoints;
        const timelineProperties: ITimelineProperties = this.timelineProperties;

        if (isMultiSelection) {
            if (this.timelineData.selectionEndIndex < index) {
                cursorDataPoints[1].selectionIndex = dataPoint.datePeriod.index + dataPoint.datePeriod.fraction;
                timelineData.selectionEndIndex = index;
            }
            else {
                cursorDataPoints[0].selectionIndex = dataPoint.datePeriod.index;
                timelineData.selectionStartIndex = index;
            }
        } else {
            timelineData.selectionStartIndex = index;
            timelineData.selectionEndIndex = index;

            cursorDataPoints[0].selectionIndex = dataPoint.datePeriod.index;
            cursorDataPoints[1].selectionIndex = dataPoint.datePeriod.index + dataPoint.datePeriod.fraction;
        }

        this.fillCells(this.settings);

        this.renderCursors(
            timelineData,
            timelineProperties.cellHeight,
            timelineProperties.cellsYPosition,
        );

        this.renderTIMERANGETEXT(timelineData, this.settings.rangeHeader);

        this.setSelection(timelineData);
        this.toggleForceSelectionOptions();
    }

    private scrollAutoFocusFunc(selectedGranulaPos: number): void {
        if (!selectedGranulaPos) {
            return;
        }

        this.mainSvgWrapperSelection.node().scrollLeft = selectedGranulaPos - this.horizontalAutoScrollingPositionOffset;
    }

    private toggleForceSelectionOptions(): void {
        const isForceSelectionTurnedOn: boolean = this.settings.forceSelection.currentPeriod
            || this.settings.forceSelection.latestAvailableDate;

        if (isForceSelectionTurnedOn) {
            this.turnOffForceSelectionOptions();
        }
    }

    private turnOffForceSelectionOptions(): void {
        this.host.persistProperties({
            merge: [{
                objectName: "forceSelection",
                properties: {
                    currentPeriod: false,
                    latestAvailableDate: false,
                },
                selector: null,
            }],
        });

        this.isForceSelectionReset = true;
    }

    private getDateInDefaultFormat(date) {
        const year = date.getFullYear();
        let month = date.getMonth() + 1;

        if (month < 10) {
            month = "0" + month;
        }

        let day = date.getDate();

        if (day < 10) {
            day = "0" + day;
        }

        return year + "-" + month + "-" + day;
    }
}
