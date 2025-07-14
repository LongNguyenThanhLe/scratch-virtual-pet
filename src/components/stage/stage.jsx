import PropTypes from "prop-types";
import React from "react";
import classNames from "classnames";

import Box from "../box/box.jsx";
import DOMElementRenderer from "../../containers/dom-element-renderer.jsx";
import Loupe from "../loupe/loupe.jsx";
import MonitorList from "../../containers/monitor-list.jsx";
import TargetHighlight from "../../containers/target-highlight.jsx";
import GreenFlagOverlay from "../../containers/green-flag-overlay.jsx";
import Question from "../../containers/question.jsx";
import MicIndicator from "../mic-indicator/mic-indicator.jsx";
import ButtonComponent from "../button/button.jsx";
import feedIcon from "./icon--feed.svg";
import playIcon from "./icon--play.svg";
import cleanIcon from "./icon--clean.svg";
import { STAGE_DISPLAY_SIZES } from "../../lib/layout-constants.js";
import { getStageDimensions } from "../../lib/screen-utils.js";
import styles from "./stage.css";

const StageComponent = (props) => {
    const {
        canvas,
        dragRef,
        isColorPicking,
        isFullScreen,
        isStarted,
        colorInfo,
        micIndicator,
        question,
        stageSize,
        useEditorDragStyle,
        onDeactivateColorPicker,
        onDoubleClick,
        onQuestionAnswered,
        hunger,
        cleanliness,
        petReactionMessage,
        happiness,
        energy,
        petSpeechMessage,
        petSpeechVisible,
        ...boxProps
    } = props;

    const stageDimensions = getStageDimensions(stageSize, isFullScreen);

    return (
        <React.Fragment>
            <Box
                className={classNames(styles.stageWrapper, {
                    [styles.withColorPicker]: !isFullScreen && isColorPicking,
                })}
                onDoubleClick={onDoubleClick}
            >
                <Box
                    className={classNames(styles.stage, {
                        [styles.fullScreen]: isFullScreen,
                    })}
                    style={{
                        height: stageDimensions.height,
                        width: stageDimensions.width,
                    }}
                >
                    <DOMElementRenderer
                        domElement={canvas}
                        style={{
                            height: stageDimensions.height,
                            width: stageDimensions.width,
                        }}
                        {...boxProps}
                    />
                    {/* Pet Status Display */}
                    <div className={styles.petStatusRow}>
                        <div className={styles.petMetric}>
                            <span className={styles.metricLabel}>Hunger:</span>
                            <div className={styles.metricBarWrapper}>
                                <div
                                    className={styles.metricBar}
                                    style={{
                                        width: `${hunger}%`,
                                        backgroundColor:
                                            hunger > 70
                                                ? "#ff6b6b"
                                                : hunger > 40
                                                ? "#ffa726"
                                                : "#4caf50",
                                    }}
                                />
                            </div>
                        </div>
                        <div className={styles.petMetric}>
                            <span className={styles.metricLabel}>
                                Cleanliness:
                            </span>
                            <div className={styles.metricBarWrapper}>
                                <div
                                    className={styles.metricBar}
                                    style={{
                                        width: `${cleanliness}%`,
                                        backgroundColor:
                                            cleanliness > 70
                                                ? "#4caf50"
                                                : cleanliness > 40
                                                ? "#ffa726"
                                                : "#ff6b6b",
                                    }}
                                />
                            </div>
                        </div>
                        <div className={styles.petMetric}>
                            <span className={styles.metricLabel}>
                                Happiness:
                            </span>
                            <div className={styles.metricBarWrapper}>
                                <div
                                    className={styles.metricBar}
                                    style={{
                                        width: `${happiness}%`,
                                        backgroundColor:
                                            happiness > 70
                                                ? "#4caf50"
                                                : happiness > 40
                                                ? "#ffa726"
                                                : "#ff6b6b",
                                    }}
                                />
                            </div>
                        </div>
                        <div className={styles.petMetric}>
                            <span className={styles.metricLabel}>Energy:</span>
                            <div className={styles.metricBarWrapper}>
                                <div
                                    className={styles.metricBar}
                                    style={{
                                        width: `${energy}%`,
                                        backgroundColor:
                                            energy > 70
                                                ? "#4caf50"
                                                : energy > 40
                                                ? "#ffa726"
                                                : "#ff6b6b",
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                    {/* Pet Speech Bubble */}
                    {petSpeechVisible && (
                        <div className={styles.petSpeechBubble}>
                            {petSpeechMessage}
                        </div>
                    )}
                    {/* Pet Reaction Message */}
                    {petReactionMessage && (
                        <div className={styles.petReactionMessage}>
                            {petReactionMessage}
                        </div>
                    )}
                    {/* Pet Interaction Buttons */}
                    <div className={styles.petButtonRow}>
                        <ButtonComponent
                            iconSrc={feedIcon}
                            onClick={props.onFeedPet}
                        >
                            Feed
                        </ButtonComponent>
                        <ButtonComponent
                            iconSrc={playIcon}
                            onClick={props.onPlayWithPet}
                        >
                            Play
                        </ButtonComponent>
                        <ButtonComponent
                            iconSrc={cleanIcon}
                            onClick={props.onCleanPet}
                        >
                            Clean
                        </ButtonComponent>
                    </div>
                    <Box className={styles.monitorWrapper}>
                        <MonitorList
                            draggable={useEditorDragStyle}
                            stageSize={stageDimensions}
                        />
                    </Box>
                    <Box className={styles.frameWrapper}>
                        <TargetHighlight
                            className={styles.frame}
                            stageHeight={stageDimensions.height}
                            stageWidth={stageDimensions.width}
                        />
                    </Box>
                    {isColorPicking && colorInfo ? (
                        <Loupe colorInfo={colorInfo} />
                    ) : null}
                </Box>

                {/* `stageOverlays` is for items that should *not* have their overflow contained within the stage */}
                <Box
                    className={classNames(styles.stageOverlays, {
                        [styles.fullScreen]: isFullScreen,
                    })}
                >
                    <div
                        className={styles.stageBottomWrapper}
                        style={{
                            width: stageDimensions.width,
                            height: stageDimensions.height,
                        }}
                    >
                        {micIndicator ? (
                            <MicIndicator
                                className={styles.micIndicator}
                                stageSize={stageDimensions}
                            />
                        ) : null}
                        {question === null ? null : (
                            <div
                                className={styles.questionWrapper}
                                style={{ width: stageDimensions.width }}
                            >
                                <Question
                                    question={question}
                                    onQuestionAnswered={onQuestionAnswered}
                                />
                            </div>
                        )}
                    </div>
                    <canvas
                        className={styles.draggingSprite}
                        height={0}
                        ref={dragRef}
                        width={0}
                    />
                </Box>
                {isStarted ? null : (
                    <GreenFlagOverlay
                        className={styles.greenFlagOverlay}
                        wrapperClass={styles.greenFlagOverlayWrapper}
                    />
                )}
            </Box>
            {isColorPicking ? (
                <Box
                    className={styles.colorPickerBackground}
                    onClick={onDeactivateColorPicker}
                />
            ) : null}
        </React.Fragment>
    );
};
StageComponent.propTypes = {
    canvas: PropTypes.instanceOf(Element).isRequired,
    colorInfo: Loupe.propTypes.colorInfo,
    dragRef: PropTypes.func,
    isColorPicking: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isStarted: PropTypes.bool,
    micIndicator: PropTypes.bool,
    onDeactivateColorPicker: PropTypes.func,
    onDoubleClick: PropTypes.func,
    onQuestionAnswered: PropTypes.func,
    question: PropTypes.string,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    useEditorDragStyle: PropTypes.bool,
};
StageComponent.defaultProps = {
    dragRef: () => {},
};
export default StageComponent;
