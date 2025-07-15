import bindAll from "lodash.bindall";
import PropTypes from "prop-types";
import React from "react";
import Renderer from "scratch-render";
import VM from "scratch-vm";
import { connect } from "react-redux";

import { STAGE_DISPLAY_SIZES } from "../lib/layout-constants";
import { getEventXY } from "../lib/touch-utils";
import VideoProvider from "../lib/video/video-provider";
import { BitmapAdapter as V2BitmapAdapter } from "scratch-svg-renderer";

import StageComponent from "../components/stage/stage.jsx";

import {
    activateColorPicker,
    deactivateColorPicker,
} from "../reducers/color-picker";

const colorPickerRadius = 20;
const dragThreshold = 3; // Same as the block drag threshold

class Stage extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            "attachMouseEvents",
            "cancelMouseDownTimeout",
            "detachMouseEvents",
            "handleDoubleClick",
            "handleQuestionAnswered",
            "onMouseUp",
            "onMouseMove",
            "onMouseDown",
            "onStartDrag",
            "onStopDrag",
            "onWheel",
            "updateRect",
            "questionListener",
            "setDragCanvas",
            "clearDragCanvas",
            "drawDragCanvas",
            "positionDragCanvas",
            "handleFeedPet",
            "handlePlayWithPet",
            "handleCleanPet",
            "handleSleepPet",
            "clearPetReactionMessage",
            "checkPetNeeds",
            "clearPetSpeech",
            "decayPetStats",
            "handleTargetsUpdate",
            "spawnFood",
            "collectFood",
            "handleFoodClick",
            "spawnWaste",
            "handleWasteClick",
        ]);
        this.state = {
            mouseDownTimeoutId: null,
            mouseDownPosition: null,
            isDragging: false,
            dragOffset: null,
            dragId: null,
            colorInfo: null,
            question: null,
            hunger: 50, // 0 = not hungry, 100 = starving
            cleanliness: 100, // 0 = dirty, 100 = clean
            happiness: 50, // 0 = sad, 100 = very happy
            energy: 100, // 0 = tired, 100 = full energy
            petReactionMessage: "",
            petSpeechMessage: "",
            petSpeechVisible: false,
            petX: 0, // Pet's x coordinate
            petY: 0, // Pet's y coordinate
            foodItems: [], // Array of food items in the field
            collectedFood: 0, // Number of food items collected
            wasteItems: [], // Array of waste items (animal waste)
            isSleeping: false,
            sleepCountdown: 0,
        };
        if (this.props.vm.renderer) {
            this.renderer = this.props.vm.renderer;
            this.canvas = this.renderer.canvas;
        } else {
            this.canvas = document.createElement("canvas");
            this.renderer = new Renderer(this.canvas);
            this.props.vm.attachRenderer(this.renderer);

            // Only attach a video provider once because it is stateful
            this.props.vm.setVideoProvider(new VideoProvider());

            // Calling draw a single time before any project is loaded just makes
            // the canvas white instead of solid black–needed because it is not
            // possible to use CSS to style the canvas to have a different
            // default color
            this.props.vm.renderer.draw();
        }
        this.props.vm.attachV2BitmapAdapter(new V2BitmapAdapter());
    }
    componentDidMount() {
        this.attachRectEvents();
        this.attachMouseEvents(this.canvas);
        this.updateRect();
        this.props.vm.runtime.addListener("QUESTION", this.questionListener);
        this.props.vm.runtime.addListener(
            "targetsUpdate",
            this.handleTargetsUpdate
        );
        // Start checking pet needs periodically
        this.petNeedsInterval = setInterval(this.checkPetNeeds, 5000);
        // Start pet stat decay timer
        this.petDecayInterval = setInterval(this.decayPetStats, 10000);
        // Start food spawning timer (now every 20 seconds)
        this.foodSpawnInterval = setInterval(this.spawnFood, 20000);
        // Start waste spawning timer (every 3 minutes)
        this.wasteSpawnInterval = setInterval(this.spawnWaste, 180000);
    }
    shouldComponentUpdate(nextProps, nextState) {
        return (
            this.props.stageSize !== nextProps.stageSize ||
            this.props.isColorPicking !== nextProps.isColorPicking ||
            this.state.colorInfo !== nextState.colorInfo ||
            this.props.isFullScreen !== nextProps.isFullScreen ||
            this.state.question !== nextState.question ||
            this.props.micIndicator !== nextProps.micIndicator ||
            this.props.isStarted !== nextProps.isStarted ||
            // Pet-related state changes
            this.state.hunger !== nextState.hunger ||
            this.state.cleanliness !== nextState.cleanliness ||
            this.state.happiness !== nextState.happiness ||
            this.state.energy !== nextState.energy ||
            this.state.petReactionMessage !== nextState.petReactionMessage ||
            this.state.petSpeechMessage !== nextState.petSpeechMessage ||
            this.state.petSpeechVisible !== nextState.petSpeechVisible ||
            this.state.petX !== nextState.petX ||
            this.state.petY !== nextState.petY ||
            // Food-related state changes
            this.state.foodItems !== nextState.foodItems ||
            this.state.collectedFood !== nextState.collectedFood ||
            // Waste-related state changes
            this.state.wasteItems !== nextState.wasteItems
        );
    }
    componentDidUpdate(prevProps) {
        if (this.props.isColorPicking && !prevProps.isColorPicking) {
            this.startColorPickingLoop();
        } else if (!this.props.isColorPicking && prevProps.isColorPicking) {
            this.stopColorPickingLoop();
        }
        this.updateRect();
        this.renderer.resize(this.rect.width, this.rect.height);
    }
    componentWillUnmount() {
        this.detachMouseEvents(this.canvas);
        this.detachRectEvents();
        this.stopColorPickingLoop();
        this.props.vm.runtime.removeListener("QUESTION", this.questionListener);
        this.props.vm.runtime.removeListener(
            "targetsUpdate",
            this.handleTargetsUpdate
        );
        if (this.petNeedsInterval) {
            clearInterval(this.petNeedsInterval);
        }
        if (this.petDecayInterval) {
            clearInterval(this.petDecayInterval);
        }
        if (this.foodSpawnInterval) {
            clearInterval(this.foodSpawnInterval);
        }
        if (this.wasteSpawnInterval) {
            clearInterval(this.wasteSpawnInterval);
        }
        if (this.sleepInterval) {
            clearInterval(this.sleepInterval);
        }
    }
    questionListener(question) {
        this.setState({ question: question });
    }
    handleQuestionAnswered(answer) {
        this.setState({ question: null }, () => {
            this.props.vm.runtime.emit("ANSWER", answer);
        });
    }
    handleTargetsUpdate() {
        // Get the pet sprite's current position
        const targets = this.props.vm.runtime.targets;
        const petTarget = targets.find(
            (target) =>
                (target.name && target.name.toLowerCase().includes("pet")) ||
                target.id === this.props.vm.editingTarget
        );

        if (petTarget) {
            // Convert Scratch coordinates to screen coordinates for the speech bubble
            const nativeSize = this.renderer.getNativeSize();
            const screenX =
                (petTarget.x / nativeSize[0]) * this.rect.width +
                this.rect.width / 2;
            const screenY =
                -(petTarget.y / nativeSize[1]) * this.rect.height +
                this.rect.height / 2;

            this.setState({
                petX: screenX,
                petY: screenY,
            });

            // Also affect pet stats when it moves (from Scratch blocks)
            this.setState((prevState) => ({
                energy: Math.max(0, prevState.energy - Math.random() * 2),
                cleanliness: Math.max(
                    0,
                    prevState.cleanliness - Math.random() * 1
                ),
            }));
        }
    }
    spawnFood() {
        this.setState((prevState) => {
            // Limit the number of food items on screen
            if (prevState.foodItems.length >= 5) {
                return prevState;
            }
            // Generate random position within the stage bounds
            const stageWidth = this.rect ? this.rect.width : 480;
            const stageHeight = this.rect ? this.rect.height : 360;
            const newFood = {
                id: Date.now() + Math.random(),
                x: Math.random() * (stageWidth - 40) + 20, // Keep away from edges
                y: Math.random() * (stageHeight - 40) + 20,
                type: Math.floor(Math.random() * 3), // 0: apple, 1: bone, 2: fish
                collected: false,
                fading: false,
            };
            // Set a timeout to fade out and remove the food after 5 seconds if not collected
            setTimeout(() => {
                this.setState((prevState2) => {
                    const food = prevState2.foodItems.find(
                        (f) => f.id === newFood.id
                    );
                    if (food && !food.collected) {
                        // Mark as fading
                        const updatedFoodItems = prevState2.foodItems.map((f) =>
                            f.id === newFood.id ? { ...f, fading: true } : f
                        );
                        // Remove after fade animation (0.5s)
                        setTimeout(() => {
                            this.setState((prevState3) => ({
                                foodItems: prevState3.foodItems.filter(
                                    (f) => f.id !== newFood.id
                                ),
                            }));
                        }, 500);
                        return { foodItems: updatedFoodItems };
                    }
                    return null;
                });
            }, 5000);
            return {
                foodItems: [...prevState.foodItems, newFood],
            };
        });
    }
    collectFood(foodId) {
        this.setState((prevState) => {
            const updatedFoodItems = prevState.foodItems.map((food) =>
                food.id === foodId ? { ...food, collected: true } : food
            );
            // Remove collected food after a short delay
            setTimeout(() => {
                this.setState((prevState) => ({
                    foodItems: prevState.foodItems.filter(
                        (food) => food.id !== foodId
                    ),
                    collectedFood: prevState.collectedFood + 1,
                    energy: Math.max(0, prevState.energy - 2),
                }));
            }, 300);
            return {
                foodItems: updatedFoodItems,
            };
        });
    }
    handleFoodClick(foodId) {
        if (this.state.isSleeping) return;
        this.collectFood(foodId);
    }
    spawnWaste = () => {
        // Only one waste at a time for simplicity
        if (this.state.wasteItems.length > 0) return;
        const stageWidth = this.rect ? this.rect.width : 480;
        const stageHeight = this.rect ? this.rect.height : 360;
        const newWaste = {
            id: Date.now() + Math.random(),
            x: Math.random() * (stageWidth - 40) + 20,
            y: Math.random() * (stageHeight - 40) + 20,
            fading: false,
        };
        this.setState((prevState) => ({
            wasteItems: [...prevState.wasteItems, newWaste],
        }));
    };

    handleWasteClick = (wasteId) => {
        if (this.state.isSleeping) return;
        // Animate fade out, then remove
        this.setState((prevState) => ({
            wasteItems: prevState.wasteItems.map((w) =>
                w.id === wasteId ? { ...w, fading: true } : w
            ),
        }));
        setTimeout(() => {
            this.setState((prevState) => ({
                wasteItems: prevState.wasteItems.filter(
                    (w) => w.id !== wasteId
                ),
                energy: Math.max(0, prevState.energy - 8),
            }));
        }, 500);
        // Optionally show a cleaning message
        this.setState({ petReactionMessage: "Thanks for cleaning! ✨" });
        setTimeout(this.clearPetReactionMessage, 1500);
    };
    startColorPickingLoop() {
        this.intervalId = setInterval(() => {
            if (typeof this.pickX === "number") {
                this.setState({
                    colorInfo: this.getColorInfo(this.pickX, this.pickY),
                });
            }
        }, 30);
    }
    stopColorPickingLoop() {
        clearInterval(this.intervalId);
    }
    attachMouseEvents(canvas) {
        document.addEventListener("mousemove", this.onMouseMove);
        document.addEventListener("mouseup", this.onMouseUp);
        document.addEventListener("touchmove", this.onMouseMove);
        document.addEventListener("touchend", this.onMouseUp);
        canvas.addEventListener("mousedown", this.onMouseDown);
        canvas.addEventListener("touchstart", this.onMouseDown);
        canvas.addEventListener("wheel", this.onWheel);
    }
    detachMouseEvents(canvas) {
        document.removeEventListener("mousemove", this.onMouseMove);
        document.removeEventListener("mouseup", this.onMouseUp);
        document.removeEventListener("touchmove", this.onMouseMove);
        document.removeEventListener("touchend", this.onMouseUp);
        canvas.removeEventListener("mousedown", this.onMouseDown);
        canvas.removeEventListener("touchstart", this.onMouseDown);
        canvas.removeEventListener("wheel", this.onWheel);
    }
    attachRectEvents() {
        window.addEventListener("resize", this.updateRect);
        window.addEventListener("scroll", this.updateRect);
    }
    detachRectEvents() {
        window.removeEventListener("resize", this.updateRect);
        window.removeEventListener("scroll", this.updateRect);
    }
    updateRect() {
        this.rect = this.canvas.getBoundingClientRect();
    }
    getScratchCoords(x, y) {
        const nativeSize = this.renderer.getNativeSize();
        return [
            (nativeSize[0] / this.rect.width) * (x - this.rect.width / 2),
            (nativeSize[1] / this.rect.height) * (y - this.rect.height / 2),
        ];
    }
    getColorInfo(x, y) {
        return {
            x: x,
            y: y,
            ...this.renderer.extractColor(x, y, colorPickerRadius),
        };
    }
    handleDoubleClick(e) {
        const { x, y } = getEventXY(e);
        // Set editing target from cursor position, if clicking on a sprite.
        const mousePosition = [x - this.rect.left, y - this.rect.top];
        const drawableId = this.renderer.pick(
            mousePosition[0],
            mousePosition[1]
        );
        if (drawableId === null) return;
        const targetId = this.props.vm.getTargetIdForDrawableId(drawableId);
        if (targetId === null) return;
        this.props.vm.setEditingTarget(targetId);
    }
    onMouseMove(e) {
        const { x, y } = getEventXY(e);
        const mousePosition = [x - this.rect.left, y - this.rect.top];

        if (this.props.isColorPicking) {
            // Set the pickX/Y for the color picker loop to pick up
            this.pickX = mousePosition[0];
            this.pickY = mousePosition[1];
        }

        if (this.state.mouseDown && !this.state.isDragging) {
            const distanceFromMouseDown = Math.sqrt(
                Math.pow(
                    mousePosition[0] - this.state.mouseDownPosition[0],
                    2
                ) +
                    Math.pow(
                        mousePosition[1] - this.state.mouseDownPosition[1],
                        2
                    )
            );
            if (distanceFromMouseDown > dragThreshold) {
                this.cancelMouseDownTimeout();
                this.onStartDrag(...this.state.mouseDownPosition);
            }
        }
        if (this.state.mouseDown && this.state.isDragging) {
            // Editor drag style only updates the drag canvas, does full update at the end of drag
            // Non-editor drag style just updates the sprite continuously.
            if (this.props.useEditorDragStyle) {
                this.positionDragCanvas(mousePosition[0], mousePosition[1]);
            } else {
                const spritePosition = this.getScratchCoords(
                    mousePosition[0],
                    mousePosition[1]
                );
                this.props.vm.postSpriteInfo({
                    x: spritePosition[0] + this.state.dragOffset[0],
                    y: -(spritePosition[1] + this.state.dragOffset[1]),
                    force: true,
                });
            }
        }
        const coordinates = {
            x: mousePosition[0],
            y: mousePosition[1],
            canvasWidth: this.rect.width,
            canvasHeight: this.rect.height,
        };
        this.props.vm.postIOData("mouse", coordinates);
    }
    onMouseUp(e) {
        const { x, y } = getEventXY(e);
        const mousePosition = [x - this.rect.left, y - this.rect.top];
        this.cancelMouseDownTimeout();
        this.setState({
            mouseDown: false,
            mouseDownPosition: null,
        });
        const data = {
            isDown: false,
            x: x - this.rect.left,
            y: y - this.rect.top,
            canvasWidth: this.rect.width,
            canvasHeight: this.rect.height,
            wasDragged: this.state.isDragging,
        };
        if (this.state.isDragging) {
            this.onStopDrag(mousePosition[0], mousePosition[1]);
        }
        this.props.vm.postIOData("mouse", data);

        if (
            this.props.isColorPicking &&
            mousePosition[0] > 0 &&
            mousePosition[0] < this.rect.width &&
            mousePosition[1] > 0 &&
            mousePosition[1] < this.rect.height
        ) {
            const { r, g, b } = this.state.colorInfo.color;
            const componentToString = (c) => {
                const hex = c.toString(16);
                return hex.length === 1 ? `0${hex}` : hex;
            };
            const colorString = `#${componentToString(r)}${componentToString(
                g
            )}${componentToString(b)}`;
            this.props.onDeactivateColorPicker(colorString);
            this.setState({ colorInfo: null });
            this.pickX = null;
            this.pickY = null;
        }
    }
    onMouseDown(e) {
        this.updateRect();
        const { x, y } = getEventXY(e);
        const mousePosition = [x - this.rect.left, y - this.rect.top];
        if (this.props.isColorPicking) {
            // Set the pickX/Y for the color picker loop to pick up
            this.pickX = mousePosition[0];
            this.pickY = mousePosition[1];
            // Immediately update the color picker info
            this.setState({
                colorInfo: this.getColorInfo(this.pickX, this.pickY),
            });
        } else {
            if (
                e.button === 0 ||
                (window.TouchEvent && e instanceof TouchEvent)
            ) {
                this.setState({
                    mouseDown: true,
                    mouseDownPosition: mousePosition,
                    mouseDownTimeoutId: setTimeout(
                        this.onStartDrag.bind(
                            this,
                            mousePosition[0],
                            mousePosition[1]
                        ),
                        400
                    ),
                });
            }
            const data = {
                isDown: true,
                x: mousePosition[0],
                y: mousePosition[1],
                canvasWidth: this.rect.width,
                canvasHeight: this.rect.height,
            };
            this.props.vm.postIOData("mouse", data);
            if (e.preventDefault) {
                // Prevent default to prevent touch from dragging page
                e.preventDefault();
                // But we do want any active input to be blurred
                if (document.activeElement && document.activeElement.blur) {
                    document.activeElement.blur();
                }
            }
        }
    }
    onWheel(e) {
        const data = {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
        };
        this.props.vm.postIOData("mouseWheel", data);
    }
    cancelMouseDownTimeout() {
        if (this.state.mouseDownTimeoutId !== null) {
            clearTimeout(this.state.mouseDownTimeoutId);
        }
        this.setState({ mouseDownTimeoutId: null });
    }
    /**
     * Initialize the position of the "dragged sprite" canvas
     * @param {DrawableExtraction} drawableData The data returned from renderer.extractDrawableScreenSpace
     * @param {number} x The x position of the initial drag event
     * @param {number} y The y position of the initial drag event
     */
    drawDragCanvas(drawableData, x, y) {
        const {
            imageData,
            x: boundsX,
            y: boundsY,
            width: boundsWidth,
            height: boundsHeight,
        } = drawableData;
        this.dragCanvas.width = imageData.width;
        this.dragCanvas.height = imageData.height;
        // On high-DPI devices, the canvas size in layout-pixels is not equal to the size of the extracted data.
        this.dragCanvas.style.width = `${boundsWidth}px`;
        this.dragCanvas.style.height = `${boundsHeight}px`;

        this.dragCanvas.getContext("2d").putImageData(imageData, 0, 0);
        // Position so that pick location is at (0, 0) so that  positionDragCanvas()
        // can use translation to move to mouse position smoothly.
        this.dragCanvas.style.left = `${boundsX - x}px`;
        this.dragCanvas.style.top = `${boundsY - y}px`;
        this.dragCanvas.style.display = "block";
    }
    clearDragCanvas() {
        this.dragCanvas.width = this.dragCanvas.height = 0;
        this.dragCanvas.style.display = "none";
    }
    positionDragCanvas(mouseX, mouseY) {
        // mouseX/Y are relative to stage top/left, and dragCanvas is already
        // positioned so that the pick location is at (0,0).
        this.dragCanvas.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
    }
    onStartDrag(x, y) {
        if (this.state.dragId) return;
        const drawableId = this.renderer.pick(x, y);
        if (drawableId === null) return;
        const targetId = this.props.vm.getTargetIdForDrawableId(drawableId);
        if (targetId === null) return;

        const target = this.props.vm.runtime.getTargetById(targetId);

        // Do not start drag unless in editor drag mode or target is draggable
        if (!(this.props.useEditorDragStyle || target.draggable)) return;

        // Dragging always brings the target to the front
        target.goToFront();

        const [scratchMouseX, scratchMouseY] = this.getScratchCoords(x, y);
        const offsetX = target.x - scratchMouseX;
        const offsetY = -(target.y + scratchMouseY);

        this.props.vm.startDrag(targetId);
        this.setState({
            isDragging: true,
            dragId: targetId,
            dragOffset: [offsetX, offsetY],
        });
        if (this.props.useEditorDragStyle) {
            // Extract the drawable art
            const drawableData =
                this.renderer.extractDrawableScreenSpace(drawableId);
            this.drawDragCanvas(drawableData, x, y);
            this.positionDragCanvas(x, y);
            this.props.vm.postSpriteInfo({ visible: false });
            this.props.vm.renderer.draw();
        }
    }
    onStopDrag(mouseX, mouseY) {
        const dragId = this.state.dragId;
        const commonStopDragActions = () => {
            this.props.vm.stopDrag(dragId);
            this.setState({
                isDragging: false,
                dragOffset: null,
                dragId: null,
            });
        };
        if (this.props.useEditorDragStyle) {
            // Need to sequence these actions to prevent flickering.
            const spriteInfo = { visible: true };
            // First update the sprite position if dropped in the stage.
            if (
                mouseX > 0 &&
                mouseX < this.rect.width &&
                mouseY > 0 &&
                mouseY < this.rect.height
            ) {
                const spritePosition = this.getScratchCoords(mouseX, mouseY);
                spriteInfo.x = spritePosition[0] + this.state.dragOffset[0];
                spriteInfo.y = -(spritePosition[1] + this.state.dragOffset[1]);
                spriteInfo.force = true;
            }
            this.props.vm.postSpriteInfo(spriteInfo);
            // Then clear the dragging canvas and stop drag (potentially slow if selecting sprite)
            this.clearDragCanvas();
            commonStopDragActions();
            this.props.vm.renderer.draw();
        } else {
            commonStopDragActions();
        }
    }
    setDragCanvas(canvas) {
        this.dragCanvas = canvas;
    }
    checkPetNeeds() {
        const { hunger, cleanliness, happiness, energy } = this.state;
        let message = "";
        let shouldShow = false;

        if (hunger > 80) {
            message = "I'm starving! 😫";
            shouldShow = true;
        } else if (hunger > 60) {
            message = "I'm getting hungry... 🍽️";
            shouldShow = true;
        } else if (cleanliness < 30) {
            message = "I feel so dirty! 🛁";
            shouldShow = true;
        } else if (cleanliness < 50) {
            message = "I could use a bath... 🧼";
            shouldShow = true;
        } else if (happiness < 30) {
            message = "I'm so sad... 😢";
            shouldShow = true;
        } else if (happiness < 50) {
            message = "I'm feeling down... 😔";
            shouldShow = true;
        } else if (energy < 30) {
            message = "I'm so tired... 😴";
            shouldShow = true;
        } else if (energy < 50) {
            message = "I need some rest... 💤";
            shouldShow = true;
        }

        if (shouldShow && !this.state.petSpeechVisible) {
            this.setState({
                petSpeechMessage: message,
                petSpeechVisible: true,
            });
            // Clear speech after 3 seconds
            setTimeout(this.clearPetSpeech, 3000);
        }
    }

    clearPetSpeech() {
        this.setState({
            petSpeechVisible: false,
            petSpeechMessage: "",
        });
    }

    decayPetStats() {
        this.setState((prevState) => {
            // Gradual stat decreases - more realistic pet care simulation
            const wastePresent = prevState.wasteItems.length > 0;
            const cleanlinessDecay = wastePresent ? 10 : 2;
            const newHunger = Math.min(100, prevState.hunger + 3); // Gets hungrier
            const newCleanliness = Math.max(
                0,
                prevState.cleanliness - cleanlinessDecay
            ); // Gets dirtier faster if waste
            const newHappiness = Math.max(0, prevState.happiness - 1); // Gets slightly sadder
            const newEnergy = Math.max(0, prevState.energy - 1); // Gets slightly tired

            return {
                hunger: newHunger,
                cleanliness: newCleanliness,
                happiness: newHappiness,
                energy: newEnergy,
            };
        });
    }

    clearPetReactionMessage() {
        this.setState({ petReactionMessage: "" });
    }

    handleFeedPet() {
        if (this.state.isSleeping) return;
        this.setState((prevState) => {
            if (prevState.collectedFood <= 0) {
                return {
                    petReactionMessage:
                        "No food collected! Find food in the field first! 🍽️",
                };
            }
            const newHunger = Math.max(0, prevState.hunger - 20);
            const newCleanliness = Math.max(0, prevState.cleanliness - 5);
            const newEnergy = Math.min(100, prevState.energy + 5);
            setTimeout(this.clearPetReactionMessage, 1500);
            return {
                hunger: newHunger,
                cleanliness: newCleanliness,
                energy: newEnergy,
                collectedFood: prevState.collectedFood - 1,
                petReactionMessage: "Yum! Thank you! 😋",
            };
        });
    }

    handlePlayWithPet() {
        if (this.state.isSleeping) return;
        this.setState((prevState) => {
            const newHappiness = Math.min(100, prevState.happiness + 20);
            const newHunger = Math.max(0, prevState.hunger - 5);
            const newEnergy = Math.max(0, prevState.energy - 10);
            setTimeout(this.clearPetReactionMessage, 1500);
            return {
                happiness: newHappiness,
                hunger: newHunger,
                energy: newEnergy,
                petReactionMessage: "Yay! That was fun! 😺🎉",
            };
        });
    }

    handleCleanPet() {
        if (this.state.isSleeping) return;
        this.setState((prevState) => {
            const newCleanliness = Math.min(100, prevState.cleanliness + 10);
            const newEnergy = Math.max(0, prevState.energy - 10);
            setTimeout(this.clearPetReactionMessage, 1500);
            return {
                cleanliness: newCleanliness,
                energy: newEnergy,
                petReactionMessage: "So fresh! 🛁✨",
            };
        });
    }

    handleSleepPet() {
        if (this.state.isSleeping) return;
        this.setState({ isSleeping: true, sleepCountdown: 30 });
        this.setState((prevState) => {
            const newEnergy = Math.min(100, prevState.energy + 30);
            const newHunger = Math.max(0, prevState.hunger - 5);
            setTimeout(this.clearPetReactionMessage, 1500);
            return {
                energy: newEnergy,
                hunger: newHunger,
                petReactionMessage: "Zzz... 💤",
            };
        });
        // Start countdown interval
        this.sleepInterval = setInterval(() => {
            this.setState((prevState) => {
                if (prevState.sleepCountdown <= 1) {
                    clearInterval(this.sleepInterval);
                    return { isSleeping: false, sleepCountdown: 0 };
                }
                return { sleepCountdown: prevState.sleepCountdown - 1 };
            });
        }, 1000);
    }
    render() {
        const {
            vm, // eslint-disable-line no-unused-vars
            onActivateColorPicker, // eslint-disable-line no-unused-vars
            ...props
        } = this.props;
        return (
            <StageComponent
                canvas={this.canvas}
                colorInfo={this.state.colorInfo}
                dragRef={this.setDragCanvas}
                question={this.state.question}
                onDoubleClick={this.handleDoubleClick}
                onQuestionAnswered={this.handleQuestionAnswered}
                onFeedPet={this.handleFeedPet}
                onPlayWithPet={this.handlePlayWithPet}
                onCleanPet={this.handleCleanPet}
                onSleepPet={this.handleSleepPet}
                hunger={this.state.hunger}
                cleanliness={this.state.cleanliness}
                happiness={this.state.happiness}
                energy={this.state.energy}
                petReactionMessage={this.state.petReactionMessage}
                petSpeechMessage={this.state.petSpeechMessage}
                petSpeechVisible={this.state.petSpeechVisible}
                petX={this.state.petX}
                petY={this.state.petY}
                foodItems={this.state.foodItems}
                collectedFood={this.state.collectedFood}
                onFoodClick={this.handleFoodClick}
                wasteItems={this.state.wasteItems}
                onWasteClick={this.handleWasteClick}
                isSleeping={this.state.isSleeping}
                sleepCountdown={this.state.sleepCountdown}
                {...props}
            />
        );
    }
}

Stage.propTypes = {
    isColorPicking: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isStarted: PropTypes.bool,
    micIndicator: PropTypes.bool,
    onActivateColorPicker: PropTypes.func,
    onDeactivateColorPicker: PropTypes.func,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    useEditorDragStyle: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired,
};

Stage.defaultProps = {
    useEditorDragStyle: true,
};

const mapStateToProps = (state) => ({
    isColorPicking: state.scratchGui.colorPicker.active,
    isFullScreen: state.scratchGui.mode.isFullScreen,
    isStarted: state.scratchGui.vmStatus.started,
    micIndicator: state.scratchGui.micIndicator,
    // Do not use editor drag style in fullscreen or player mode.
    useEditorDragStyle: !(
        state.scratchGui.mode.isFullScreen || state.scratchGui.mode.isPlayerOnly
    ),
});

const mapDispatchToProps = (dispatch) => ({
    onActivateColorPicker: () => dispatch(activateColorPicker()),
    onDeactivateColorPicker: (color) => dispatch(deactivateColorPicker(color)),
});

export default connect(mapStateToProps, mapDispatchToProps)(Stage);
