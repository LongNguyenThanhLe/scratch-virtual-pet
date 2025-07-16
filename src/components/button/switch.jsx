import React from "react";
import PropTypes from "prop-types";

const Switch = ({ checked, onChange, label }) => (
    <label
        style={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            gap: 8,
        }}
    >
        <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            style={{ display: "none" }}
        />
        <span
            style={{
                width: 36,
                height: 20,
                background: checked ? "#4caf50" : "#ccc",
                borderRadius: 12,
                position: "relative",
                transition: "background 0.2s",
                display: "inline-block",
            }}
        >
            <span
                style={{
                    position: "absolute",
                    left: checked ? 18 : 2,
                    top: 2,
                    width: 16,
                    height: 16,
                    background: "#fff",
                    borderRadius: "50%",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                }}
            />
        </span>
        <span style={{ fontWeight: 600, fontSize: 11 }}>{label}</span>
    </label>
);

Switch.propTypes = {
    checked: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string,
};

export default Switch;
