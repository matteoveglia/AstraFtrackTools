import type React from "react";
import { useState } from "react";
import { Box, Text, useInput } from "ink";

interface SelectItem {
	label: string;
	value: string;
	disabled?: boolean;
}

interface SelectInputProps {
	items: SelectItem[];
	onSelect: (value: string) => void;
	initialIndex?: number;
}

export const SelectInput: React.FC<SelectInputProps> = ({
	items,
	onSelect,
	initialIndex = 0,
}) => {
	const [selectedIndex, setSelectedIndex] = useState(initialIndex);

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => {
				let newIndex = prev - 1;
				// Skip disabled items
				while (newIndex >= 0 && items[newIndex]?.disabled) {
					newIndex--;
				}
				return newIndex >= 0 ? newIndex : prev;
			});
		} else if (key.downArrow) {
			setSelectedIndex((prev) => {
				let newIndex = prev + 1;
				// Skip disabled items
				while (newIndex < items.length && items[newIndex]?.disabled) {
					newIndex++;
				}
				return newIndex < items.length ? newIndex : prev;
			});
		} else if (key.return) {
			const selectedItem = items[selectedIndex];
			if (selectedItem && !selectedItem.disabled) {
				onSelect(selectedItem.value);
			}
		}
	});

	return (
		<Box flexDirection="column">
			{items.map((item, index) => {
				const isSelected = index === selectedIndex;
				const cursor = isSelected ? "❯" : " ";
				const color = item.disabled ? "gray" : isSelected ? "cyan" : "white";

				return (
					<Box key={item.value}>
						<Text color={color}>
							{cursor} {item.label}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
};
